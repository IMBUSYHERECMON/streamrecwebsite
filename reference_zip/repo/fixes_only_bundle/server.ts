import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import youtubedl from 'youtube-dl-exec';
import FormData from 'form-data';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StreamerRecord {
  id: string;
  name: string;
  url: string;
  check_interval_seconds: number;
  state: 'offline' | 'checking' | 'live';
  last_seen_live_at: string | null;
  manual_start_required: boolean;
  _last_check_at?: number;
}

interface RecordingRecord {
  id: string;
  streamer_id: string;
  streamer_name: string;
  status: 'Recording' | 'Failed' | 'Completed' | 'Uploading...' | 'Uploaded' | 'Upload Failed' | 'Abandoned';
  started_at: string;
  finished_at: string | null;
  file_path: string;
  file_name?: string;
  folder_url: string | null;
  file_url?: string;
  direct_url?: string;
  gofile_guest_token?: string;
  stop_reason?: 'manual' | 'stream-ended' | 'failed' | 'unknown';
}

interface AppSettings {
  webhook_url: string;
  download_dir: string;
}

interface DbShape {
  streamers: StreamerRecord[];
  recordings: RecordingRecord[];
  settings: AppSettings;
}

// Simple JSON file based DB
class JsonDB {
  private file: string;
  public data: DbShape;

  constructor(filename: string, defaultData: DbShape) {
    this.file = path.join(DATA_DIR, filename);
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify(defaultData, null, 2));
      this.data = defaultData;
    } else {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    }
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}

const db = new JsonDB('db.json', {
  streamers: [],
  recordings: [],
  settings: {
    webhook_url: '',
    download_dir: 'data/recordings'
  }
});

async function notifyDiscord(message: string) {
  const url = db.data.settings.webhook_url;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (e) {
    console.error('Discord webhook failed', e);
  }
}

function extractGoFileCode(url?: string) {
  if (!url) return null;
  const match = url.match(/gofile\.io\/d\/([a-zA-Z0-9]+)/);
  return match?.[1] ?? null;
}

async function fetchGoFileDirectLink(downloadPage?: string, guestToken?: string) {
  const code = extractGoFileCode(downloadPage);
  if (!code) return null;
  const attempts: Array<{ token?: string; wt?: string }> = [
    { token: guestToken, wt: '4fd6sg89d7s6' },
    { wt: '4fd6sg89d7s6' },
    { token: guestToken },
    {}
  ];

  for (const attempt of attempts) {
    try {
      const headers: Record<string, string> = {};
      if (attempt.token) headers.Authorization = `Bearer ${attempt.token}`;
      const contentRes = await axios.get(`https://api.gofile.io/contents/${code}`, {
        headers,
        params: attempt.wt ? { wt: attempt.wt } : undefined
      });
      const children = contentRes.data?.data?.children || {};
      const firstVideo = Object.values(children).find((child: any) =>
        child?.mimetype?.startsWith('video/') || String(child?.name || '').toLowerCase().endsWith('.mp4')
      ) as any;
      if (firstVideo?.link) return firstVideo.link;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status && status !== 401 && status !== 403 && status !== 404) {
        console.error('GoFile direct-url resolve request failed', status);
      }
    }
  }
  console.warn('Unable to resolve GoFile direct url from download page.');
  return null;
}

const activeDownloads = new Map<string, any>(); // Map<streamerId, child_process>
const MANUAL_STOP_COOLDOWN_MS = 90_000;

function normalizeStreamerInput(raw: string) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return trimmed;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    const firstSegment = cleanPath.split('/').filter(Boolean)[0] || '';

    if (host.includes('tiktok.com')) {
      const handle = firstSegment.startsWith('@') ? firstSegment : `@${firstSegment}`;
      return `https://www.tiktok.com/${handle}/live`;
    }

    if (host.includes('twitch.tv')) {
      return `https://www.twitch.tv/${firstSegment || trimmed.replace(/^@/, '')}`;
    }

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      if (cleanPath.includes('/live')) return parsed.toString();
      if (firstSegment.startsWith('@')) return `https://www.youtube.com/${firstSegment}/live`;
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    const handle = trimmed.replace(/^@/, '');
    if (!handle) return trimmed;
    return `https://www.twitch.tv/${handle}`;
  }
}

function getRecordingById(id: string) {
  return db.data.recordings.find((r: RecordingRecord) => r.id === id);
}

function setStreamerManualStop(streamerId: string) {
  const streamer = db.data.streamers.find((s: StreamerRecord) => s.id === streamerId);
  if (!streamer) return;
  streamer.state = 'offline';
  streamer.manual_start_required = true;
  streamer._last_check_at = Date.now();
}

function startActualRecording(streamer: StreamerRecord) {
  if (activeDownloads.has(streamer.id)) return; // Already recording/checking

  streamer.state = 'checking';
  db.save();

  const recordingId = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 7);
  const rawDir = db.data.settings.download_dir;
  const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const safeName = (streamer.name || streamer.url).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(destDir, `${safeName}_${recordingId}.mp4`);

  const normalizedUrl = normalizeStreamerInput(streamer.url);
  console.log(`[${safeName}] Starting yt-dlp check... (${normalizedUrl})`);
  
  const dlProcess = youtubedl.exec(normalizedUrl, {
    output: filePath,
    format: 'b',
    noLiveFromStart: true,
    waitForVideo: 15,
    hlsUseMpegts: true,
    retries: 3,
    fragmentRetries: 3
  } as any);

  // Catch promise rejection to prevent server crash
  // @ts-ignore -- properties exist on promise
  dlProcess.catch((err) => {
    // We ignore error here since it's handled via stderr/close
  });

  activeDownloads.set(streamer.id, dlProcess);

  let isLive = false;
  let notLiveDetected = false;
  const MIN_VALID_RECORDING_BYTES = 512 * 1024;

  const markRecordingLive = () => {
    isLive = true;
    streamer.state = 'live';
    streamer.last_seen_live_at = new Date().toISOString();

    const alreadyExists = db.data.recordings.find((r: RecordingRecord) => r.id === recordingId);
    if (!alreadyExists) {
      const recording: RecordingRecord = {
        id: recordingId,
        streamer_id: streamer.id,
        streamer_name: streamer.name || streamer.url,
        status: 'Recording',
        started_at: new Date().toISOString(),
        finished_at: null as string | null,
        file_path: filePath,
        file_name: path.basename(filePath),
        folder_url: null
      };
      db.data.recordings.unshift(recording);
      db.save();
      notifyDiscord(`🔴 **LIVE**: Started recording **${streamer.name || streamer.url}**`);
      console.log(`[${safeName}] Stream is LIVE! Recording to ${filePath}`);
    }
  };

  const liveProbe = setInterval(() => {
    if (isLive) return;
    if (!fs.existsSync(filePath)) return;
    try {
      const size = fs.statSync(filePath).size;
      if (size >= MIN_VALID_RECORDING_BYTES) {
        markRecordingLive();
      }
    } catch (e) {}
  }, 2000);

  // @ts-ignore -- properties exist on promise
  dlProcess.stdout?.on('data', (data) => {
    // keep stream active; actual "live" promotion is based on file growth to avoid false positives
  });

  // @ts-ignore -- properties exist on promise
  dlProcess.stderr?.on('data', (data) => {
    const msg = data.toString();
    const lowered = msg.toLowerCase();
    if (!isLive && (lowered.includes('is offline') || lowered.includes('not currently live') || lowered.includes('no video formats found'))) {
      streamer.state = 'offline';
      notLiveDetected = true;
    }
    if (!msg.toLowerCase().includes('offline')) {
      console.log(`[${safeName}] yt-dlp: ${msg.trim()}`);
    }
  });

  // @ts-ignore -- properties exist on promise
  dlProcess.on('close', (code: any, signal: any) => {
    clearInterval(liveProbe);
    activeDownloads.delete(streamer.id);
    streamer.state = 'offline';
    
    if (isLive) {
      const recording = db.data.recordings.find((r: RecordingRecord) => r.id === recordingId);
      if (recording && recording.status !== 'Completed') {
        const finalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        if (notLiveDetected || (code !== 0 && finalSize < MIN_VALID_RECORDING_BYTES)) {
          db.data.recordings = db.data.recordings.filter((r: RecordingRecord) => r.id !== recordingId);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }
          const partFile = filePath + '.part';
          if (fs.existsSync(partFile)) {
            try { fs.unlinkSync(partFile); } catch (e) {}
          }
          db.save();
          console.log(`[${safeName}] Ignored non-live/failed probe; removed tiny output.`);
          return;
        }
        const isSuccess = code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL';
        recording.status = isSuccess ? 'Completed' : 'Failed';
        recording.stop_reason = isSuccess ? 'stream-ended' : 'failed';
        recording.finished_at = new Date().toISOString();
        
        // Fix for abruptly killed yt-dlp leaving .part files
        if (isSuccess) {
          const partFile = filePath + '.part';
          if (fs.existsSync(partFile)) {
             try {
               fs.renameSync(partFile, filePath);
               console.log(`[${safeName}] Renamed .part to final file.`);
             } catch (e) {
               console.error(`[${safeName}] Failed to rename .part file`, e);
             }
          }
        }

        console.log(`[${safeName}] Recording finished (code ${code}, signal ${signal}).`);
      }
    } else {
      console.log(`[${safeName}] Stream is currently offline.`);
    }
    db.save();
  });
}

// Background watcher loop
setInterval(() => {
  const now = Date.now();
  for (const streamer of db.data.streamers) {
    const lastCheck = streamer._last_check_at || 0;
    const intervalMs = (streamer.check_interval_seconds || 300) * 1000;

    if (streamer.manual_start_required && now - lastCheck >= MANUAL_STOP_COOLDOWN_MS) {
      streamer.manual_start_required = false;
      db.save();
    }

    if (streamer.state === 'offline' && !streamer.manual_start_required) {
      if (now - lastCheck >= intervalMs) {
        streamer._last_check_at = now;
        startActualRecording(streamer);
      }
    }
  }
}, 10000); // Check every 10 seconds

function cleanupStaleRecordings() {
   let modified = false;
   db.data.streamers.forEach((s: StreamerRecord) => {
      if (s.state !== 'offline') {
         s.state = 'offline';
         modified = true;
      }
   });
   db.data.recordings.forEach((r: RecordingRecord) => {
      if (r.status === 'Recording' || r.status === 'Uploading...') {
         r.status = 'Abandoned';
         r.finished_at = r.finished_at || new Date().toISOString();
         modified = true;
      }
   });
   if (modified) db.save();
}

cleanupStaleRecordings();

let lastPartSweep = 0;
function maybeCleanPartFiles() {
  const now = Date.now();
  if (now - lastPartSweep < 60000) return;
  lastPartSweep = now;
  try {
    const rawDir = db.data.settings.download_dir || 'data/recordings';
    const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);
    if (fs.existsSync(destDir)) {
       fs.readdirSync(destDir).forEach(f => {
          if (f.endsWith('.part')) {
             try {
                fs.renameSync(path.join(destDir, f), path.join(destDir, f.replace('.part', '')));
                console.log(`[Cleaner] Recovered stuck file: ${f}`);
             } catch (e) {}
          }
       });
    }
  } catch(e) {}
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API ROUTES ---

  app.get('/api/status', (req, res) => {
    res.json({
      counts: {
        live: db.data.streamers.filter((s: StreamerRecord) => s.state === 'live').length,
        monitored: db.data.streamers.length,
        recordings: db.data.recordings.length
      },
      settings: db.data.settings
    });
  });

  app.get('/api/streamers', (req, res) => {
    res.json(db.data.streamers);
  });

  app.post('/api/streamers', (req, res) => {
    const { name, url, check_interval_seconds } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: "URL is required" });
    }
    const normalizedUrl = normalizeStreamerInput(url);
    const interval = Math.max(Number(check_interval_seconds) || 300, 30);
    const newStreamer: StreamerRecord = {
      id: Date.now().toString(),
      name: name || '',
      url: normalizedUrl,
      check_interval_seconds: interval,
      state: 'offline', // checking, live, offline
      last_seen_live_at: null,
      manual_start_required: false
    };
    db.data.streamers.push(newStreamer);
    db.save();
    notifyDiscord(`👀 **ADDED**: Now monitoring **${newStreamer.name || newStreamer.url}**`);
    res.json(newStreamer);
  });

  app.delete('/api/streamers/:id', (req, res) => {
    const streamer = db.data.streamers.find((s: StreamerRecord) => s.id === req.params.id);
    db.data.streamers = db.data.streamers.filter((s: StreamerRecord) => s.id !== req.params.id);
    db.save();
    if (streamer) notifyDiscord(`🗑️ **REMOVED**: Stopped monitoring **${streamer.name || streamer.url}**`);
    res.json({ success: true });
  });

  app.post('/api/streamers/:id/start', (req, res) => {
    const streamer = db.data.streamers.find((s: StreamerRecord) => s.id === req.params.id);
    if (streamer) {
        streamer.url = normalizeStreamerInput(streamer.url);
        streamer.manual_start_required = false;
        streamer._last_check_at = Date.now();
        startActualRecording(streamer);
        db.save();
    }
    res.json({ success: true });
  });

  app.post('/api/streamers/:id/stop', (req, res) => {
    const streamer = db.data.streamers.find((s: StreamerRecord) => s.id === req.params.id);
    if (!streamer) return res.status(404).json({ error: 'Streamer not found' });

    const process = activeDownloads.get(streamer.id);
    if (process) {
      try { process.kill('SIGTERM'); } catch (e) {}
    }

    const activeRecording = db.data.recordings.find((r: RecordingRecord) => r.streamer_id === streamer.id && r.status === 'Recording');
    if (activeRecording) {
      activeRecording.status = 'Completed';
      activeRecording.stop_reason = 'manual';
      activeRecording.finished_at = new Date().toISOString();
      const partFile = activeRecording.file_path + '.part';
      if (fs.existsSync(partFile)) {
        try { fs.renameSync(partFile, activeRecording.file_path); } catch (e) {}
      }
    }

    activeDownloads.delete(streamer.id);
    setStreamerManualStop(streamer.id);
    db.save();
    notifyDiscord(`🛑 **STOPPED**: Manual stop for **${streamer.name || streamer.url}**`);
    res.json({ success: true, cooldown_ms: MANUAL_STOP_COOLDOWN_MS });
  });

  app.get('/api/recordings', (req, res) => {
    maybeCleanPartFiles();
    
    // Normalize file_name for older records
    const records = db.data.recordings.map((r: RecordingRecord) => {
       if (!r.file_name && r.file_path) {
          r.file_name = path.basename(r.file_path);
       }
       const media_url = r.file_path && fs.existsSync(r.file_path) ? `/api/recordings/${r.id}/stream` : undefined;
       return { ...r, media_url };
    });

    res.json(records);
  });

  app.delete('/api/recordings/:id', (req, res) => {
    const recording = getRecordingById(req.params.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if (recording.status === 'Recording') return res.status(409).json({ error: 'Cannot delete active recording' });

    if (recording.file_path && fs.existsSync(recording.file_path)) {
      try { fs.unlinkSync(recording.file_path); } catch (e) {
        console.error('Failed deleting recording file', e);
      }
    }

    const partFile = `${recording.file_path}.part`;
    if (fs.existsSync(partFile)) {
      try { fs.unlinkSync(partFile); } catch (e) {}
    }

    db.data.recordings = db.data.recordings.filter((r: RecordingRecord) => r.id !== req.params.id);
    db.save();
    res.json({ success: true });
  });

  app.delete('/api/recordings', (req, res) => {
    const deletable = db.data.recordings.filter((r: RecordingRecord) => r.status !== 'Recording');
    for (const recording of deletable) {
      if (recording.file_path && fs.existsSync(recording.file_path)) {
        try { fs.unlinkSync(recording.file_path); } catch (e) {}
      }
      const partFile = `${recording.file_path}.part`;
      if (fs.existsSync(partFile)) {
        try { fs.unlinkSync(partFile); } catch (e) {}
      }
    }

    db.data.recordings = db.data.recordings.filter((r: RecordingRecord) => r.status === 'Recording');
    db.save();
    res.json({ success: true, deleted: deletable.length });
  });
  
  app.post('/api/recordings/:id/stop', (req, res) => {
      const recording = getRecordingById(req.params.id);
      if (recording && recording.status === 'Recording') {
         // Forcefully kill any system level yt-dlp pointing to this URL
         const streamer = db.data.streamers.find((s: StreamerRecord) => s.id === recording.streamer_id);
         if (streamer && streamer.url) {
             try {
                execFile('pkill', ['-9', '-f', `yt-dlp.*${streamer.url}`], () => {});
             } catch(e) {}
         }

         const process = activeDownloads.get(recording.streamer_id);
         if (process) {
            try { process.kill('SIGKILL'); } catch(e) {}
         }
         
         // Fallback and update instantly to make UI extremely snappy
         recording.status = 'Completed';
         recording.stop_reason = 'manual';
         recording.finished_at = new Date().toISOString();
         
         // Ensure .part file is renamed if present
         const partFile = recording.file_path + '.part';
         if (fs.existsSync(partFile)) {
           try {
             fs.renameSync(partFile, recording.file_path);
           } catch(e) {}
         }
         
         if(streamer){
            setStreamerManualStop(streamer.id);
         }
         activeDownloads.delete(recording.streamer_id);
         db.save();
         notifyDiscord(`🛑 **STOPPED**: Manually stopped recording **${recording.streamer_name}**`);
      }
      res.json({ success: true });
  });

  app.post('/api/recordings/:id/upload', async (req, res) => {
      const recording = db.data.recordings.find((r: RecordingRecord) => r.id === req.params.id);
      if (!recording) return res.status(404).json({ error: "Not found" });
      if (!fs.existsSync(recording.file_path)) return res.status(404).json({ error: "File missing on disk" });
      if (recording.status === 'Uploading...') return res.status(409).json({ error: 'Upload already in progress' });
      
      const form = new FormData();
      form.append('file', fs.createReadStream(recording.file_path));

      // Set to uploading instantly to give feedback
      recording.status = 'Uploading...';
      db.save();
      
      // Let frontend know we've started
      res.json({ success: true, message: "Upload started to GoFile" });

      try {
        // Query GoFile for the optimal server
        const initRes = await axios.get('https://api.gofile.io/servers');
        if (initRes.data?.status !== 'ok') {
          throw new Error('Failed to fetch GoFile server');
        }
        
        const serverName = initRes.data.data.servers[0].name;

        const uploadRes = await axios.post(`https://${serverName}.gofile.io/contents/uploadfile`, form, {
          headers: {
            ...form.getHeaders(),
            'User-Agent': 'curl/7.81.0'
          }
        });
        
        const data = uploadRes.data;
        if (data.status === 'ok' && data.data && data.data.downloadPage) {
           recording.file_url = data.data.downloadPage;
           recording.gofile_guest_token = data.data.guestToken || recording.gofile_guest_token;
           const immediateDirect = data.data.directLink || data.data.link;
           recording.direct_url = immediateDirect || await fetchGoFileDirectLink(data.data.downloadPage, recording.gofile_guest_token) || data.data.downloadPage;
           recording.status = 'Uploaded';
        } else {
           recording.status = 'Upload Failed';
           console.error("GoFile failed payload:", data);
        }
      } catch (err) {
        console.error("Upload error:", err);
        recording.status = 'Upload Failed';
      }
      db.save();
  });

  app.post('/api/recordings/:id/resolve-direct-url', async (req, res) => {
    const recording = getRecordingById(req.params.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if (!recording.file_url) return res.status(400).json({ error: 'No GoFile url to resolve' });

    const resolved = await fetchGoFileDirectLink(recording.file_url, recording.gofile_guest_token);
    if (!resolved) return res.status(404).json({ error: 'No direct media link found' });

    recording.direct_url = resolved;
    db.save();
    res.json({ success: true, direct_url: resolved });
  });

  app.get('/api/recordings/:id/stream', (req, res) => {
    const recording = getRecordingById(req.params.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if (!fs.existsSync(recording.file_path)) return res.status(404).json({ error: 'File missing on disk' });

    const stat = fs.statSync(recording.file_path);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=300');

    if (!range) {
      res.setHeader('Content-Length', fileSize);
      fs.createReadStream(recording.file_path).pipe(res);
      return;
    }

    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number(parts[0]);
    const end = parts[1] ? Number(parts[1]) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
      return res.status(416).send('Requested range not satisfiable');
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    fs.createReadStream(recording.file_path, { start, end }).pipe(res);
  });

  app.post('/api/recordings/:id/convert-mp4', (req, res) => {
      const recording = db.data.recordings.find((r: RecordingRecord) => r.id === req.params.id);
      if (recording) {
          // Mock conversion
          setTimeout(() => {
              recording.file_path = recording.file_path.replace('.ts', '.mp4');
              db.save();
          }, 2000);
      }
      res.json({ success: true, message: "Conversion started in background."});
  });

  app.get('/api/settings', (req, res) => {
    res.json(db.data.settings);
  });

  app.post('/api/settings', (req, res) => {
    const { webhook_url, download_dir } = req.body;
    if (webhook_url !== undefined) db.data.settings.webhook_url = webhook_url;
    if (download_dir !== undefined) {
      db.data.settings.download_dir = download_dir;
    }
    db.save();
    res.json(db.data.settings);
  });

  // Serve static media
  app.use('/media', (req, res, next) => {
    const rawDir = db.data.settings.download_dir || 'data/recordings';
    const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    express.static(destDir)(req, res, next);
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV === "development") {
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite server failed to initialize:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

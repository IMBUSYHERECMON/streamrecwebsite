import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
// Fix: Use ESM-compatible import instead of require() for child_process.
// The original code used require('child_process') inside a route handler which
// crashes in ESM ("type": "module") projects.
import { execFile } from 'child_process';
import youtubedl from 'youtube-dl-exec';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Data layer ───────────────────────────────────────────────────────────────

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
  /** ISO timestamp of the last time we attempted startActualRecording() */
  _last_check_at?: string;
}

interface RecordingRecord {
  id: string;
  streamer_id: string;
  streamer_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  file_path: string;
  file_name: string;   // always present after fix
  file_url?: string;
  folder_url: string | null;
}

interface DbShape {
  streamers: StreamerRecord[];
  recordings: RecordingRecord[];
  settings: { webhook_url: string; download_dir: string };
}

class JsonDB {
  private file: string;
  public data: DbShape;

  constructor(filename: string, defaultData: DbShape) {
    this.file = path.join(DATA_DIR, filename);
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify(defaultData, null, 2));
      this.data = defaultData;
    } else {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as DbShape;
    }
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}

const db = new JsonDB('db.json', {
  streamers: [],
  recordings: [],
  settings: { webhook_url: '', download_dir: 'data/recordings' },
});

// ─── Startup cleanup ──────────────────────────────────────────────────────────
// Fix: On server start, any recording still marked 'Recording' is stale
// (the previous server process died). Mark them 'Abandoned' so the UI doesn't
// show phantom in-progress recordings and the watcher doesn't dead-lock.
let didCleanup = false;
function cleanupStaleRecordings() {
  if (didCleanup) return;
  didCleanup = true;
  let dirty = false;
  for (const r of db.data.recordings) {
    if (r.status === 'Recording') {
      r.status = 'Abandoned';
      r.finished_at = new Date().toISOString();
      dirty = true;
    }
  }
  // Reset any streamer locked in 'checking' or 'live' state
  for (const s of db.data.streamers) {
    if (s.state !== 'offline') {
      s.state = 'offline';
      dirty = true;
    }
  }
  if (dirty) {
    db.save();
    console.log('[Startup] Cleaned up stale recordings and streamer states.');
  }
}
cleanupStaleRecordings();

// ─── Discord ──────────────────────────────────────────────────────────────────

async function notifyDiscord(message: string) {
  const url = db.data.settings.webhook_url;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (e) {
    console.error('Discord webhook failed', e);
  }
}

// ─── Recording engine ─────────────────────────────────────────────────────────

// Map<streamerId, ExecaChildProcess>
const activeDownloads = new Map<string, any>();

function startActualRecording(streamer: StreamerRecord) {
  if (activeDownloads.has(streamer.id)) return; // Already in progress

  streamer.state = 'checking';
  streamer._last_check_at = new Date().toISOString();
  db.save();

  const recordingId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const rawDir = db.data.settings.download_dir || 'data/recordings';
  const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const safeName = (streamer.name || streamer.url).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(destDir, `${safeName}_${recordingId}.mp4`);

  console.log(`[${safeName}] Starting yt-dlp check…`);

  const dlProcess = youtubedl.exec(streamer.url, {
    output: filePath,
    format: 'best',
  });

  // Suppress unhandled promise rejection — errors are handled via close event
  // @ts-ignore — ExecaChildProcess is both a Promise and a ChildProcess
  dlProcess.catch(() => {});

  activeDownloads.set(streamer.id, dlProcess);

  let isLive = false;

  // @ts-ignore
  dlProcess.stdout?.on('data', (data: Buffer) => {
    if (!isLive) {
      const msg = data.toString().toLowerCase();
      if (msg.includes('downloading')) {
        isLive = true;
        streamer.state = 'live';
        streamer.last_seen_live_at = new Date().toISOString();

        const alreadyExists = db.data.recordings.find((r) => r.id === recordingId);
        if (!alreadyExists) {
          const recording: RecordingRecord = {
            id: recordingId,
            streamer_id: streamer.id,
            streamer_name: streamer.name || streamer.url,
            status: 'Recording',
            started_at: new Date().toISOString(),
            finished_at: null,
            file_path: filePath,
            file_name: path.basename(filePath), // always populated
            folder_url: null,
          };
          db.data.recordings.unshift(recording);
          db.save();
          notifyDiscord(`🔴 **LIVE**: Started recording **${streamer.name || streamer.url}**`);
          console.log(`[${safeName}] Stream is LIVE! Recording → ${filePath}`);
        }
      }
    }
  });

  // @ts-ignore
  dlProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString();
    if (!msg.toLowerCase().includes('offline')) {
      console.log(`[${safeName}] yt-dlp: ${msg.trim()}`);
    }
  });

  // @ts-ignore
  dlProcess.on('close', (code: number | null, signal: string | null) => {
    activeDownloads.delete(streamer.id);
    streamer.state = 'offline';

    if (isLive) {
      const recording = db.data.recordings.find((r) => r.id === recordingId);
      if (recording && recording.status === 'Recording') {
        const isSuccess = code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL';
        recording.status = isSuccess ? 'Completed' : 'Failed';
        recording.finished_at = new Date().toISOString();

        // Fix: rename any leftover .part file
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

// ─── Background watcher ───────────────────────────────────────────────────────
// Fix: Respect each streamer's check_interval_seconds instead of using a fixed
// 30-second hardcoded interval for everyone.

const WATCHER_TICK_MS = 10_000; // How often we evaluate whether a check is due

setInterval(() => {
  const now = Date.now();
  for (const streamer of db.data.streamers) {
    if (streamer.state !== 'offline' || streamer.manual_start_required) continue;
    if (activeDownloads.has(streamer.id)) continue;

    const intervalMs = (streamer.check_interval_seconds || 300) * 1000;
    const lastCheck = streamer._last_check_at ? new Date(streamer._last_check_at).getTime() : 0;

    if (now - lastCheck >= intervalMs) {
      startActualRecording(streamer);
    }
  }
}, WATCHER_TICK_MS);

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ── API routes ─────────────────────────────────────────────────────────────

  app.get('/api/status', (_req, res) => {
    res.json({
      counts: {
        live: db.data.streamers.filter((s) => s.state === 'live').length,
        monitored: db.data.streamers.length,
        recordings: db.data.recordings.length,
      },
      settings: db.data.settings,
    });
  });

  app.get('/api/streamers', (_req, res) => {
    res.json(db.data.streamers);
  });

  app.post('/api/streamers', (req, res) => {
    const { name, url, check_interval_seconds } = req.body as {
      name?: string;
      url?: string;
      check_interval_seconds?: number;
    };

    // Fix: Validate that url is present and non-empty
    if (!url || typeof url !== 'string' || url.trim() === '') {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    // Basic URL sanity check — must start with http(s):// or look like a handle
    const trimmedUrl = url.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      // Accept bare handles/usernames — yt-dlp can resolve platform handles
      // but log a warning
      console.warn(`[API] Non-URL streamer target added: ${trimmedUrl}`);
    }

    const newStreamer: StreamerRecord = {
      id: Date.now().toString(),
      name: (name || '').trim(),
      url: trimmedUrl,
      check_interval_seconds: Math.max(30, Number(check_interval_seconds) || 300),
      state: 'offline',
      last_seen_live_at: null,
      manual_start_required: false,
    };

    db.data.streamers.push(newStreamer);
    db.save();
    notifyDiscord(`👀 **ADDED**: Now monitoring **${newStreamer.name || newStreamer.url}**`);
    res.json(newStreamer);
  });

  app.delete('/api/streamers/:id', (req, res) => {
    const streamer = db.data.streamers.find((s) => s.id === req.params.id);
    db.data.streamers = db.data.streamers.filter((s) => s.id !== req.params.id);
    db.save();
    if (streamer) {
      notifyDiscord(`🗑️ **REMOVED**: Stopped monitoring **${streamer.name || streamer.url}**`);
    }
    res.json({ success: true });
  });

  app.post('/api/streamers/:id/start', (req, res) => {
    const streamer = db.data.streamers.find((s) => s.id === req.params.id);
    if (streamer) {
      // Reset last check time so the watcher doesn't throttle a manual trigger
      streamer._last_check_at = undefined;
      startActualRecording(streamer);
    }
    res.json({ success: true });
  });

  app.get('/api/recordings', (_req, res) => {
    // Fix: Only run the .part-file sweep once per minute max to avoid hammering
    // the filesystem on every 5-second frontend poll.
    maybeCleanPartFiles();

    // Fix: Normalise any missing file_name fields before sending to client
    for (const r of db.data.recordings) {
      if (!r.file_name && r.file_path) {
        r.file_name = path.basename(r.file_path);
      }
    }

    res.json(db.data.recordings || []);
  });

  // Rate-limited .part-file sweep
  let lastPartSweep = 0;
  function maybeCleanPartFiles() {
    const now = Date.now();
    if (now - lastPartSweep < 60_000) return;
    lastPartSweep = now;
    try {
      const rawDir = db.data.settings.download_dir || 'data/recordings';
      const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);
      if (fs.existsSync(destDir)) {
        fs.readdirSync(destDir).forEach((f) => {
          if (f.endsWith('.part')) {
            try {
              fs.renameSync(
                path.join(destDir, f),
                path.join(destDir, f.replace('.part', '')),
              );
              console.log(`[Cleaner] Recovered stuck file: ${f}`);
            } catch {}
          }
        });
      }
    } catch {}
  }

  app.post('/api/recordings/:id/stop', (req, res) => {
    const recording = db.data.recordings.find((r) => r.id === req.params.id);
    if (recording && recording.status === 'Recording') {
      const streamer = db.data.streamers.find((s) => s.id === recording.streamer_id);

      // Fix: Use execFile instead of exec to avoid shell-injection via streamer URL.
      // execFile does NOT invoke a shell, so special characters in the URL are safe.
      if (streamer?.url) {
        execFile('pkill', ['-9', '-f', `yt-dlp.*${streamer.url}`], () => {
          // Ignore exit code — pkill returns 1 if no match, which is fine
        });
      }

      // Kill via tracked handle
      const dlProcess = activeDownloads.get(recording.streamer_id);
      if (dlProcess) {
        try {
          dlProcess.kill('SIGKILL');
        } catch {}
      }

      recording.status = 'Completed';
      recording.finished_at = new Date().toISOString();

      // Rename any leftover .part file
      const partFile = recording.file_path + '.part';
      if (fs.existsSync(partFile)) {
        try { fs.renameSync(partFile, recording.file_path); } catch {}
      }

      if (streamer) streamer.state = 'offline';
      activeDownloads.delete(recording.streamer_id);
      db.save();
      notifyDiscord(`🛑 **STOPPED**: Manually stopped recording **${recording.streamer_name}**`);
    }
    res.json({ success: true });
  });

  app.get('/api/settings', (_req, res) => {
    res.json(db.data.settings);
  });

  app.post('/api/settings', (req, res) => {
    // Merge only the known fields to prevent arbitrary data injection
    const { webhook_url, download_dir } = req.body as Partial<DbShape['settings']>;
    if (webhook_url !== undefined) db.data.settings.webhook_url = String(webhook_url);
    if (download_dir !== undefined) db.data.settings.download_dir = String(download_dir);
    db.save();
    res.json(db.data.settings);
  });

  // ── Media streaming ────────────────────────────────────────────────────────
  // Recordings are served directly from the configured download_dir.
  // express.static handles HTTP Range requests automatically, so the browser's
  // native <video> player can seek through large files without downloading the
  // entire file first. No third-party upload service is needed.
  app.use('/media', (req, res, next) => {
    const rawDir = db.data.settings.download_dir || 'data/recordings';
    const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    // Prevent directory traversal: ensure the resolved path stays inside destDir
    const requestedPath = path.resolve(destDir, '.' + req.path);
    if (!requestedPath.startsWith(path.resolve(destDir))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    express.static(destDir, {
      // express.static sets Accept-Ranges: bytes automatically — this enables
      // the browser video player to seek by issuing HTTP Range requests.
      setHeaders(res) {
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      },
    })(req, res, next);
  });

  // ── Vite middleware ────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    try {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error('Vite server failed to initialize:', e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

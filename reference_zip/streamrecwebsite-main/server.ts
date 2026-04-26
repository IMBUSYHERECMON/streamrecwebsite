import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile, execFileSync, spawn } from 'child_process';
import youtubedl from 'youtube-dl-exec';
import FormData from 'form-data';
import axios from 'axios';
import ffmpegStatic from 'ffmpeg-static';
import type { IncomingMessage, ServerResponse } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveAppRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, '..'),
    __dirname
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return process.cwd();
}

const APP_ROOT = resolveAppRoot();

// Ensure data directory exists
const DATA_DIR = path.join(APP_ROOT, 'data');
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

interface FixedHeyMateVideo {
  id: string;
  youtube_id: string;
  title: string;
  channel: string;
  upload_date: string | null;
  description?: string | null;
  duration?: number | null;
  file_size?: number | null;
  thumbnail_url?: string | null;
  source_url?: string | null;
  playback_url: string;
  storage_type: 'remote' | 'local';
  status: 'ready' | 'archiving' | 'error';
  archived_at: string;
  expires_at: string;
  error_message?: string | null;
}

interface FixedHeyMateDbShape {
  videos: FixedHeyMateVideo[];
}

interface TikTokDownloadJob {
  id: string;
  username: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  output_dir: string;
  zip_path: string | null;
  zip_url: string | null;
  created_at: string;
  updated_at: string;
  logs: string[];
  error_message?: string | null;
}

interface TikTokDownloaderDbShape {
  jobs: TikTokDownloadJob[];
}

const FIXED_HEYMATE_DIR = path.join(APP_ROOT, 'imports', 'fixedheymate');
const TIKTOK_DOWNLOADER_SCRIPT = path.join(APP_ROOT, 'imports', 'tiktok-downloader', 'download_tiktok.py');
const FIXED_HEYMATE_STORAGE_DIR = path.join(DATA_DIR, 'fixedheymate');
const TIKTOK_DOWNLOADER_DATA_DIR = path.join(DATA_DIR, 'tiktok-downloader');
const CURATED_FIXED_HEYMATE_VIDEOS = [
  { title: "My Reaction To Raud's Reaction (Content Creators)", channel: 'Jumanne', upload_date: '20260420', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1495933731951607898/My_Reaction_To_Rauds_Reaction_Content_Creators_-_Jumanne_1080p_h264.mp4?ex=69e95dda&is=69e80c5a&hm=fa8c7a1ef9275971b4ed5535ebc0194fbf50fbcac943b74a187ea2067b0ef709&' },
  { title: 'Hunbling Experience', channel: 'Jumanne', upload_date: '20260420', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1495933048997285998/Humbling_Experience_-_Jumanne_1080p_h264.mp4?ex=69e95d37&is=69e80bb7&hm=5d7485802ad92902f98f0419a6765f79af767940976acdd41bed10e799f6c24e&' },
  { title: "I'm Bothered By This", channel: 'Jumanne Alt', upload_date: '20260419', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1495560547607777400/Im_Bothered_By_This....._-_Jumanne_1080p_h264.mp4?ex=69e953cc&is=69e8024c&hm=62c74826cc9d46ab4552ba69e850b55a8e7aabc3173d734d5cd6d23c8c079aac&' },
  { title: 'Dollar Tree + Subway = Jumanne', channel: 'Jumanne', upload_date: '20260419', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1495560443639496845/Dollar_Tree__Subway__Jumanne_-_Jumanne_1080p_h264.mp4?ex=69e953b3&is=69e80233&hm=9ec32da15159cda7b48b673ce262a1792cdabf4b887bdce985e30ca920b5862c&' },
  { title: '😱¯', channel: 'Jumanne', upload_date: '20260419', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1495560285346332773/-_Jumanne_1080p_h264.mp4?ex=69e9538e&is=69e8020e&hm=e6185a04d7c56454bf1df857ae39ef046a8b84037181286f67fe76ffb84d1b05&' },
  { title: 'Woman Were Right For Rejecting Me!', channel: 'Jumanne', upload_date: '20260418', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1495202423625748611/Woman_Were_Right_For_Rejecting_Me_-_Jumanne_1080p_h264.mp4?ex=69e957c5&is=69e80645&hm=9d81f8593fc05a317aa08e4af6573d67fa590080cd7ededac4f3b8e7f2b92954&' },
  { title: 'A Troll Apologized To Me!', channel: 'Jumanne Alt', upload_date: '20260417', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1495159959023784007/A_Troll_Apologized_To_Me_-_Jumanne_1080p_h264.mp4?ex=69e93038&is=69e7deb8&hm=11dfa23395d06d44f1ea76ed9ce56db334924960de7c56c86a996cdc323c4de1&' },
  { title: 'Freeing Myself From Lust!!!', channel: 'Jumanne', upload_date: '20260414', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493668116482494658/Freeing_Myself_From_Lust_-_Jumanne_1080p_h264.mp4?ex=69e908d5&is=69e7b755&hm=ea5ba327f9c8c498cb85366fedb3f6085c8fed29adf6c9c818f439a24f126e9c&' },
  { title: "It's My Job To Expose Myself?!", channel: 'Jumanne', upload_date: '20260407', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493551093882552420/Its_My_Job_To_Expose_Myself_e2f02df8.mp4?ex=69e94499&is=69e7f319&hm=e2afb04024f36cf9e71da2407add8bb2ca61e92c7d83baa02ae5176cd92e3ebe&' },
  { title: 'I See The Way People Look At Me!', channel: 'Jumanne', upload_date: '20260413', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493550629241622608/nAph4nodzFQ-1776157168611_25bd56fa.mp4?ex=69e9442a&is=69e7f2aa&hm=e62dcfd964003742040e2af5add8299cc02ba2e1852b09721801ce67889a49ff&' },
  { title: 'I’m Deeply Appreciative!!!', channel: 'Jumanne', upload_date: '20260413', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493550480142499932/Wi6gL_bFrOo-1776155606666_f160d186.mp4?ex=69e94407&is=69e7f287&hm=5af4d5ca9d9e27f61511c29bda9e136320a36bb3890f132e79e2dc4837dc1aa3&' },
  { title: 'I Might Miss Being Broke!', channel: 'Jumanne Alt', upload_date: '20260413', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493550135035170846/PxpmbM95kNM-1776155247858_ff3e5ec3.mp4?ex=69e943b5&is=69e7f235&hm=7aa3579148fcda8b1e956db40e0bd9875bd646bd01ed0f5b651291be75341339&' },
  { title: 'Watching YouTube Documentaries', channel: 'Jumanne Alt', upload_date: '20260412', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493550041917427803/DAzaYiJQ4mQ-1776155570516_562f1bb8.mp4?ex=69e9439e&is=69e7f21e&hm=11c8478e7b8b5292a332395505918e8210ae6579026a4b7f2d831cab7df4491a&' },
  { title: 'Everyone Is Going Through Their Own Problems!', channel: 'Jumanne Alt', upload_date: '20260412', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493549847083618334/gWW_LN-RJ88-1776155214082_346b7ad2.mp4?ex=69e94370&is=69e7f1f0&hm=2281734afe7d286f3820c9029c2f8cb51d5178ed646843e0a5bfeb3edfe8932a&' },
  { title: 'My Bank Account Is Still Overdrafted', channel: 'Jumanne Alt', upload_date: '20260412', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493549493701054624/woHS_qU08ok-1776155149517_0fce7ccc.mp4?ex=69e9431c&is=69e7f19c&hm=3aa1781cb87ea8c47dbf08e92cdca3e36596ecaadc8905d5b03e286c2d7253bd&' },
  { title: "I'm Ready To Crashout!!! (SERIOUSLY)", channel: 'Jumanne', upload_date: '20260410', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493548063065772052/Im_Ready_To_Crashout_SERIOUSLY_-_Jumanne.mp4?ex=69e941c7&is=69e7f047&hm=f4caeec3a37723b1cb6441b87f2ed09e6037df33f2181dbf3f0e6b4f611dc690&' },
  { title: 'Losing Myself', channel: 'Jumanne', upload_date: '20260409', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493546364561522788/fsDg2DuPSxU-1776157558979_aa22639a.mp4?ex=69e94032&is=69e7eeb2&hm=6bace3c62d5925937654df215bed27b78fe59bed1cf5aaa4fc2a73bb08e2ec03&' },
  { title: 'Losing Myself (Preview) Vlog', channel: 'Jumanne', upload_date: '20260409', playback_url: 'https://cdn.discordapp.com/attachments/1352101258235875338/1493546884189388880/aPs7LN1Cc8-1776157709689_456254e6.mp4?ex=69e940ad&is=69e7ef2d&hm=6c9fb01a2c6b15324133baf1eb155ad02cf005275c69cce23d59c528fca78a3e&' }
];

// Simple JSON file based DB
class JsonDB<T> {
  private file: string;
  public data: T;

  constructor(filename: string, defaultData: T) {
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

const db = new JsonDB<DbShape>('db.json', {
  streamers: [],
  recordings: [],
  settings: {
    webhook_url: '',
    download_dir: 'data/recordings'
  }
});

const fixedHeyMateDb = new JsonDB<FixedHeyMateDbShape>('fixedheymate-db.json', {
  videos: []
});

const tiktokDownloaderDb = new JsonDB<TikTokDownloaderDbShape>('tiktok-downloader-db.json', {
  jobs: []
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

function isDirectMediaUrl(url?: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const pathname = parsed.pathname.toLowerCase();
    return !pathname.startsWith('/d/') && /\.(mp4|m4v|webm|mov|mkv|ts|m3u8)(\?|$)/i.test(pathname);
  } catch {
    return false;
  }
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
const activeConversions = new Map<string, Promise<string>>();
const MANUAL_STOP_COOLDOWN_MS = 90_000;
const bundledFfmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;
const streamlinkCandidates = [
  path.join(APP_ROOT, '.venv', 'bin', 'streamlink'),
  path.join(path.dirname(APP_ROOT), '.venv', 'bin', 'streamlink')
];
const streamlinkPath = streamlinkCandidates.find((candidate) => fs.existsSync(candidate)) ?? streamlinkCandidates[0];

function getRecorderDependencies() {
  const ytDlpPath = path.join(APP_ROOT, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
  const ffmpegReady = Boolean(bundledFfmpegPath && fs.existsSync(bundledFfmpegPath));
  let ffmpegHealthy = false;
  if (ffmpegReady && bundledFfmpegPath) {
    try {
      execFileSync(bundledFfmpegPath, ['-version'], { stdio: 'ignore' });
      ffmpegHealthy = true;
    } catch {
      ffmpegHealthy = false;
    }
  }
  return {
    yt_dlp: {
      ready: fs.existsSync(ytDlpPath),
      source: 'bundled',
      path: ytDlpPath
    },
    ffmpeg: {
      ready: ffmpegReady && ffmpegHealthy,
      source: 'bundled',
      path: bundledFfmpegPath
    },
    streamlink: {
      ready: fs.existsSync(streamlinkPath),
      source: 'project-venv',
      path: streamlinkPath
    }
  };
}

function getRecorderReadiness() {
  const dependencies = getRecorderDependencies();
  const missing = Object.entries(dependencies)
    .filter(([, value]) => !value.ready)
    .map(([key]) => key);

  return {
    ready: dependencies.streamlink.ready || (dependencies.yt_dlp.ready && dependencies.ffmpeg.ready),
    missing,
    dependencies
  };
}

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

function isTwitchUrl(raw: string) {
  return /twitch\.tv/i.test(raw);
}

function isYouTubeUrl(raw: string) {
  return /youtube\.com|youtu\.be/i.test(raw);
}

function isTikTokUrl(raw: string) {
  return /tiktok\.com/i.test(raw);
}

function shouldUseStreamlink(raw: string) {
  return isTwitchUrl(raw) || isYouTubeUrl(raw) || isTikTokUrl(raw);
}

function getRequiredRecorderForUrl(raw: string) {
  if (shouldUseStreamlink(raw)) {
    return ['streamlink'] as const;
  }
  return ['yt_dlp', 'ffmpeg'] as const;
}

function getRecordingById(id: string) {
  return db.data.recordings.find((r: RecordingRecord) => r.id === id);
}

function countFilesRecursively(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return 1;
  return fs.readdirSync(targetPath).reduce((total: number, entry: string) => {
    return total + countFilesRecursively(path.join(targetPath, entry));
  }, 0);
}

function ensureDir(targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function downloadDirectVideoToLocal(url: string, outputPath: string) {
  ensureDir(path.dirname(outputPath));
  const tempPath = `${outputPath}.part`;
  const writer = fs.createWriteStream(tempPath);
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 30_000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });
    await new Promise<void>((resolve, reject) => {
      response.data.pipe(writer);
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
    });
    fs.renameSync(tempPath, outputPath);
    return fs.statSync(outputPath).size;
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    throw error;
  }
}

function getFixedHeyMateSeedVideos() {
  const seedPath = path.join(FIXED_HEYMATE_DIR, 'scripts', 'seed-videos.mjs');
  if (!fs.existsSync(seedPath)) return [];
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const cdn = raw.match(/const CDN = "([^"]+)"/)?.[1] ?? '';
  const itemRegex = /\{\s*youtubeId:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*channel:\s*"([^"]+)",\s*uploadDate:\s*"([^"]+)",\s*cdnUrl:\s*`?\$\{CDN\}\/([^`"]+)`?\s*\}/g;
  const items: Array<{ youtubeId: string; title: string; channel: string; uploadDate: string; cdnUrl: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(raw))) {
    items.push({
      youtubeId: match[1],
      title: match[2],
      channel: match[3],
      uploadDate: match[4],
      cdnUrl: `${cdn}/${match[5]}`
    });
  }
  return items;
}

function seedFixedHeyMateDb() {
  if (fixedHeyMateDb.data.videos.length > 0) return;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  fixedHeyMateDb.data.videos = getFixedHeyMateSeedVideos().map((video, index) => ({
    id: `seed_${index + 1}`,
    youtube_id: video.youtubeId,
    title: video.title,
    channel: video.channel,
    upload_date: video.uploadDate,
    playback_url: video.cdnUrl,
    source_url: `https://www.youtube.com/watch?v=${video.youtubeId}`,
    storage_type: 'remote',
    status: 'ready',
    archived_at: now.toISOString(),
    expires_at: expires,
    thumbnail_url: null,
    description: null,
    duration: null,
    file_size: null,
    error_message: null
  }));
  fixedHeyMateDb.save();
}

seedFixedHeyMateDb();

function listFixedHeyMateVideos() {
  const toTimestamp = (uploadDate: string | null | undefined, archivedAt: string) => {
    const raw = (uploadDate || '').trim();
    if (/^\d{8}$/.test(raw)) {
      const year = Number(raw.slice(0, 4));
      const month = Number(raw.slice(4, 6)) - 1;
      const day = Number(raw.slice(6, 8));
      return Date.UTC(year, month, day);
    }
    const parsedUpload = Date.parse(raw);
    if (!Number.isNaN(parsedUpload)) return parsedUpload;
    const parsedArchived = Date.parse(archivedAt);
    if (!Number.isNaN(parsedArchived)) return parsedArchived;
    return 0;
  };

  return [...fixedHeyMateDb.data.videos].sort((a, b) => {
    const byDate = toTimestamp(b.upload_date, b.archived_at) - toTimestamp(a.upload_date, a.archived_at);
    if (byDate !== 0) return byDate;
    return b.archived_at.localeCompare(a.archived_at);
  });
}

function toArchiverResponseVideo(video: FixedHeyMateVideo): FixedHeyMateVideo {
  return {
    ...video,
    playback_url: `/api/archiver/videos/${video.id}/play`
  };
}

function getFixedHeyMateVideo(id: string) {
  return fixedHeyMateDb.data.videos.find((video) => video.id === id);
}

function updateFixedHeyMateVideo(id: string, patch: Partial<FixedHeyMateVideo>) {
  const video = getFixedHeyMateVideo(id);
  if (!video) return undefined;
  Object.assign(video, patch);
  fixedHeyMateDb.save();
  return video;
}

function reconcileArchiverVideoStatuses() {
  let changed = false;
  for (const video of fixedHeyMateDb.data.videos) {
    if (video.storage_type !== 'local') continue;
    const localPath = path.join(FIXED_HEYMATE_STORAGE_DIR, 'videos', `${video.id}.mp4`);
    const exists = fs.existsSync(localPath);

    if (exists && (video.status !== 'ready' || video.error_message)) {
      video.status = 'ready';
      video.error_message = null;
      changed = true;
      continue;
    }

    if (!exists && video.status === 'ready') {
      video.status = 'error';
      video.error_message = 'Local archive file missing';
      changed = true;
    }
  }
  if (changed) fixedHeyMateDb.save();
}

function runExecFile(bin: string, args: string[], options: Parameters<typeof execFile>[2] = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(String(stderr || stdout || error.message)));
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function getRecorderBinaryPath() {
  return path.join(APP_ROOT, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
}

async function fetchFixedHeyMateMeta(url: string) {
  const args = ['--dump-single-json', '--no-playlist', '--no-warnings'];
  const cookiesPath = path.join(FIXED_HEYMATE_DIR, 'private', 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }
  args.push('--js-runtimes', `node:${process.execPath}`, url);
  const { stdout } = await runExecFile(getRecorderBinaryPath(), args);
  return JSON.parse(stdout);
}

async function startFixedHeyMateArchive(url: string) {
  const meta = await fetchFixedHeyMateMeta(url);
  const existing = fixedHeyMateDb.data.videos.find((video) => video.youtube_id === meta.id);
  if (existing && existing.status !== 'error') {
    return existing;
  }

  ensureDir(path.join(FIXED_HEYMATE_STORAGE_DIR, 'videos'));
  const id = existing?.id ?? createId('vault');
  const filePath = path.join(FIXED_HEYMATE_STORAGE_DIR, 'videos', `${id}.mp4`);
  const now = new Date();
  const record: FixedHeyMateVideo = existing ?? {
    id,
    youtube_id: meta.id,
    title: meta.title,
    channel: meta.channel || 'Unknown',
    upload_date: meta.upload_date ?? null,
    description: meta.description ?? null,
    duration: meta.duration ?? null,
    file_size: null,
    thumbnail_url: meta.thumbnail ?? null,
    source_url: url,
    playback_url: `/api/archiver/videos/${id}/play`,
    storage_type: 'local',
    status: 'archiving',
    archived_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    error_message: null
  };

  if (!existing) {
    fixedHeyMateDb.data.videos.unshift(record);
    fixedHeyMateDb.save();
  } else {
    updateFixedHeyMateVideo(existing.id, {
      title: meta.title,
      channel: meta.channel || 'Unknown',
      upload_date: meta.upload_date ?? null,
      description: meta.description ?? null,
      duration: meta.duration ?? null,
      thumbnail_url: meta.thumbnail ?? null,
      source_url: url,
      playback_url: `/api/archiver/videos/${existing.id}/play`,
      storage_type: 'local',
      status: 'archiving',
      error_message: null
    });
  }

  const args = ['--no-playlist', '--no-warnings', '--no-part'];
  const cookiesPath = path.join(FIXED_HEYMATE_DIR, 'private', 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }
  args.push('--js-runtimes', `node:${process.execPath}`);
  if (bundledFfmpegPath) {
    args.push('--ffmpeg-location', bundledFfmpegPath);
  }
  args.push('-f', 'best[ext=mp4]/best', '-o', filePath, url);

  const proc = execFile(getRecorderBinaryPath(), args, { maxBuffer: 10 * 1024 * 1024 }, (error) => {
    if (error) {
      updateFixedHeyMateVideo(record.id, {
        status: 'error',
        error_message: error.message
      });
      return;
    }
    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : null;
    updateFixedHeyMateVideo(record.id, {
      status: 'ready',
      file_size: size ?? null,
      playback_url: `/api/archiver/videos/${record.id}/play`,
      storage_type: 'local',
      error_message: null
    });
  });

  proc.stderr?.on('data', (chunk) => {
    const msg = String(chunk).trim();
    if (msg) {
      updateFixedHeyMateVideo(record.id, { error_message: msg });
    }
  });

  return record;
}

async function redownloadArchiverVideo(id: string) {
  const video = getFixedHeyMateVideo(id);
  if (!video) throw new Error('Video not found');

  const source = video.source_url || video.playback_url;
  if (!source) throw new Error('No source URL available');

  if (!/^https?:\/\//i.test(source)) {
    throw new Error('Unsupported source URL');
  }

  updateFixedHeyMateVideo(video.id, { status: 'archiving', error_message: null });

  if (!/\.(mp4|m4v|webm|mov|mkv|ts)(\?|$)/i.test(source)) {
    return startFixedHeyMateArchive(source);
  }

  const localPath = path.join(FIXED_HEYMATE_STORAGE_DIR, 'videos', `${video.id}.mp4`);
  const fileSize = await downloadDirectVideoToLocal(source, localPath);
  return updateFixedHeyMateVideo(video.id, {
    storage_type: 'local',
    status: 'ready',
    file_size: fileSize,
    playback_url: `/api/archiver/videos/${video.id}/play`,
    error_message: null
  });
}

function listTikTokJobs() {
  return [...tiktokDownloaderDb.data.jobs].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function getTikTokJob(id: string) {
  return tiktokDownloaderDb.data.jobs.find((job) => job.id === id);
}

function updateTikTokJob(id: string, patch: Partial<TikTokDownloadJob>) {
  const job = getTikTokJob(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updated_at: new Date().toISOString() });
  tiktokDownloaderDb.save();
  return job;
}

function startTikTokDownloadJob(username: string) {
  ensureDir(TIKTOK_DOWNLOADER_DATA_DIR);
  const cleanUsername = username.replace(/^@/, '').trim();
  const jobId = createId('tiktok');
  const outputDir = path.join(TIKTOK_DOWNLOADER_DATA_DIR, cleanUsername);
  const zipPath = path.join(TIKTOK_DOWNLOADER_DATA_DIR, `${cleanUsername}.zip`);
  const createdAt = new Date().toISOString();
  const job: TikTokDownloadJob = {
    id: jobId,
    username: cleanUsername,
    status: 'queued',
    output_dir: outputDir,
    zip_path: null,
    zip_url: null,
    created_at: createdAt,
    updated_at: createdAt,
    logs: [`Queued download for @${cleanUsername}`],
    error_message: null
  };
  tiktokDownloaderDb.data.jobs.unshift(job);
  tiktokDownloaderDb.save();

  const proc = spawn('python3', [
    TIKTOK_DOWNLOADER_SCRIPT,
    '--username',
    cleanUsername,
    '--output-dir',
    outputDir,
    '--zip-name',
    zipPath
  ], {
    cwd: path.dirname(TIKTOK_DOWNLOADER_SCRIPT)
  });

  updateTikTokJob(jobId, { status: 'running' });

  const appendLog = (data: unknown) => {
    const text = String(data).trim();
    if (!text) return;
    const current = getTikTokJob(jobId);
    if (!current) return;
    current.logs.push(...text.split('\n'));
    current.logs = current.logs.slice(-80);
    current.updated_at = new Date().toISOString();
    tiktokDownloaderDb.save();
  };

  proc.stdout.on('data', appendLog);
  proc.stderr.on('data', appendLog);
  proc.on('close', (code) => {
    if (code === 0 && fs.existsSync(zipPath)) {
      updateTikTokJob(jobId, {
        status: 'completed',
        zip_path: zipPath,
        zip_url: `/api/tiktok-downloader/jobs/${jobId}/download`,
        error_message: null
      });
      return;
    }
    updateTikTokJob(jobId, {
      status: 'failed',
      error_message: `Downloader exited with code ${code}`
    });
  });

  return job;
}

function readFixedHeyMateSummary() {
  const packagePath = path.join(FIXED_HEYMATE_DIR, 'package.json');
  const todoPath = path.join(FIXED_HEYMATE_DIR, 'todo.md');
  const pagesDir = path.join(FIXED_HEYMATE_DIR, 'client', 'src', 'pages');
  const scriptsDir = path.join(FIXED_HEYMATE_DIR, 'scripts');

  if (!fs.existsSync(packagePath)) {
    return null;
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const todoPreview = fs.existsSync(todoPath)
    ? fs.readFileSync(todoPath, 'utf-8').split('\n').filter(Boolean).slice(0, 8)
    : [];
  const pageRoutes = fs.existsSync(pagesDir)
    ? fs.readdirSync(pagesDir).filter((name) => name.endsWith('.tsx'))
    : [];
  const scripts = fs.existsSync(scriptsDir)
    ? fs.readdirSync(scriptsDir).filter((name) => !name.startsWith('.'))
    : [];

  return {
    name: pkg.name,
    version: pkg.version,
    path: FIXED_HEYMATE_DIR,
    todo_preview: todoPreview,
    page_routes: pageRoutes,
    scripts,
    total_files: countFilesRecursively(FIXED_HEYMATE_DIR)
  };
}

function readTikTokDownloaderSummary() {
  if (!fs.existsSync(TIKTOK_DOWNLOADER_SCRIPT)) {
    return null;
  }

  const script = fs.readFileSync(TIKTOK_DOWNLOADER_SCRIPT, 'utf-8');
  const tiktokUrl = script.match(/TIKTOK_URL\s*=\s*\"([^\"]+)\"/)?.[1] ?? '';
  const outputDir = script.match(/OUTPUT_DIR\s*=\s*\"([^\"]+)\"/)?.[1] ?? '';
  const zipName = script.match(/ZIP_NAME\s*=\s*\"([^\"]+)\"/)?.[1] ?? '';

  return {
    script_path: TIKTOK_DOWNLOADER_SCRIPT,
    tiktok_url: tiktokUrl,
    output_dir: outputDir,
    zip_name: zipName,
    preview: script.split('\n').slice(0, 28)
  };
}

async function ensureRecordingDirectUrl(recording: RecordingRecord) {
  if (isDirectMediaUrl(recording.direct_url)) return recording.direct_url;
  if (!recording.file_url) return null;

  const resolved = await fetchGoFileDirectLink(recording.file_url, recording.gofile_guest_token);
  if (!resolved) return null;

  recording.direct_url = resolved;
  db.save();
  return resolved;
}

function getPlaybackFilePath(filePath: string) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.playback.mp4`);
}

function tryDeleteFile(filePath: string | null | undefined) {
  if (!filePath) return;
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error(`Failed deleting file ${filePath}`, error);
  }
}

function deleteRecordingArtifacts(recording: RecordingRecord) {
  if (!recording.file_path) return;
  tryDeleteFile(recording.file_path);
  tryDeleteFile(`${recording.file_path}.part`);
  tryDeleteFile(getPlaybackFilePath(recording.file_path));
}

async function ensurePlaybackFile(recording: RecordingRecord) {
  if (!recording.file_path || !fs.existsSync(recording.file_path)) return null;

  const ext = path.extname(recording.file_path).toLowerCase();
  if (ext === '.mp4' || ext === '.webm' || ext === '.mov') {
    return recording.file_path;
  }

  const outputPath = getPlaybackFilePath(recording.file_path);
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return outputPath;
  }

  if (!bundledFfmpegPath || !fs.existsSync(bundledFfmpegPath)) return recording.file_path;

  const existing = activeConversions.get(recording.id);
  if (existing) return existing;

  const conversion = new Promise<string>((resolve, reject) => {
    const finalize = (target: string) => {
      activeConversions.delete(recording.id);
      resolve(target);
    };

    const fallbackTranscode = () => {
      execFile(
        bundledFfmpegPath,
        ['-y', '-i', recording.file_path, '-movflags', '+faststart', '-c:v', 'libx264', '-c:a', 'aac', outputPath],
        (fallbackError) => {
          activeConversions.delete(recording.id);
          if (fallbackError) return reject(fallbackError);
          finalize(outputPath);
        }
      );
    };

    execFile(
      bundledFfmpegPath,
      ['-y', '-i', recording.file_path, '-movflags', '+faststart', '-c', 'copy', outputPath],
      (copyError) => {
        if (!copyError) return finalize(outputPath);
        fallbackTranscode();
      }
    );
  });

  activeConversions.set(recording.id, conversion);
  return conversion;
}

function streamLocalFile(req: express.Request, res: express.Response, filePath: string) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === '.ts' ? 'video/mp2t' : 'video/mp4';
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (!range) {
    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const parts = range.replace(/bytes=/, '').split('-');
  const start = Number(parts[0]);
  const end = parts[1] ? Number(parts[1]) : fileSize - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
    res.status(416).send('Requested range not satisfiable');
    return;
  }

  const chunkSize = end - start + 1;
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  res.setHeader('Content-Length', chunkSize);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function setStreamerManualStop(streamerId: string) {
  const streamer = db.data.streamers.find((s: StreamerRecord) => s.id === streamerId);
  if (!streamer) return;
  streamer.state = 'offline';
  streamer.manual_start_required = true;
  streamer._last_check_at = Date.now();
}

function finalizeRecordingProcess(
  streamer: StreamerRecord,
  recordingId: string,
  filePath: string,
  safeName: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  isLive: boolean,
  notLiveDetected: boolean
) {
  activeDownloads.delete(streamer.id);
  streamer.state = 'offline';

  const MIN_VALID_RECORDING_BYTES = 512 * 1024;
  if (isLive) {
    const recording = db.data.recordings.find((r: RecordingRecord) => r.id === recordingId);
    if (recording && recording.status !== 'Completed') {
      const finalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      if (notLiveDetected || (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL' && finalSize < MIN_VALID_RECORDING_BYTES)) {
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
}

function startActualRecording(streamer: StreamerRecord) {
  if (activeDownloads.has(streamer.id)) return; // Already recording/checking

  const dependencies = getRecorderDependencies();
  const required = getRequiredRecorderForUrl(streamer.url);
  const missing = required.filter((key) => !dependencies[key].ready);
  if (missing.length > 0) {
    streamer.state = 'offline';
    db.save();
    console.error(`[${streamer.name || streamer.url}] Recorder dependencies missing: ${missing.join(', ')}`);
    return;
  }

  streamer.state = 'checking';
  db.save();

  const recordingId = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 7);
  const rawDir = db.data.settings.download_dir;
  const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(APP_ROOT, rawDir);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const safeName = (streamer.name || streamer.url).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileExtension = shouldUseStreamlink(streamer.url) ? 'ts' : 'mp4';
  const filePath = path.join(destDir, `${safeName}_${recordingId}.${fileExtension}`);

  const normalizedUrl = normalizeStreamerInput(streamer.url);
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

  if (shouldUseStreamlink(normalizedUrl)) {
    console.log(`[${safeName}] Starting streamlink capture... (${normalizedUrl})`);
    const outputStream = fs.createWriteStream(filePath);
    const dlProcess = spawn(streamlinkPath, ['--stdout', normalizedUrl, 'best'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    dlProcess.stdout.pipe(outputStream);
    activeDownloads.set(streamer.id, dlProcess);

    dlProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      const lowered = msg.toLowerCase();
      if (!isLive && (
        lowered.includes('no playable streams found') ||
        lowered.includes('could not open stream') ||
        lowered.includes('unable to validate') ||
        lowered.includes('failed to reload playlist') ||
        lowered.includes('error')
      )) {
        notLiveDetected = true;
        streamer.state = 'offline';
      }
      if (msg) console.log(`[${safeName}] streamlink: ${msg}`);
    });

    dlProcess.on('close', (code, signal) => {
      clearInterval(liveProbe);
      outputStream.end();
      finalizeRecordingProcess(streamer, recordingId, filePath, safeName, code, signal, isLive, notLiveDetected);
    });

    outputStream.on('error', (error) => {
      console.error(`[${safeName}] streamlink write error`, error);
    });

    return;
  }

  console.log(`[${safeName}] Starting yt-dlp check... (${normalizedUrl})`);
  const dlProcess = youtubedl.exec(normalizedUrl, {
    output: filePath,
    format: 'b',
    ffmpegLocation: dependencies.ffmpeg.path || undefined,
    noLiveFromStart: true,
    waitForVideo: 15,
    hlsUseMpegts: true,
    retries: 3,
    fragmentRetries: 3
  } as any);

  dlProcess.catch((_err) => {
    // Errors are surfaced via stderr/close handlers.
  });

  activeDownloads.set(streamer.id, dlProcess);

  // @ts-ignore -- properties exist on promise
  dlProcess.stdout?.on('data', () => {
    // actual "live" promotion is based on file growth to avoid false positives
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
    finalizeRecordingProcess(streamer, recordingId, filePath, safeName, code, signal, isLive, notLiveDetected);
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
    const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(APP_ROOT, rawDir);
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

async function createApp() {
  const app = express();

  app.use(express.json());

  // --- API ROUTES ---

  app.get('/api/status', (req, res) => {
    const recorder = getRecorderReadiness();
    res.json({
      counts: {
        live: db.data.streamers.filter((s: StreamerRecord) => s.state === 'live').length,
        monitored: db.data.streamers.length,
        recordings: db.data.recordings.length
      },
      settings: db.data.settings,
      recorder
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
    if (!streamer) return res.status(404).json({ error: 'Streamer not found' });

    const recorder = getRecorderReadiness();
    const required = getRequiredRecorderForUrl(streamer.url);
    const missing = required.filter((key) => !recorder.dependencies[key].ready);
    if (missing.length > 0) {
      return res.status(503).json({
        error: `Recorder dependencies missing for this streamer: ${missing.join(', ')}`,
        recorder
      });
    }

    streamer.url = normalizeStreamerInput(streamer.url);
    streamer.manual_start_required = false;
    streamer._last_check_at = Date.now();
    startActualRecording(streamer);
    db.save();

    res.json({ success: true, recorder });
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
       const playback_url = (r.file_path && fs.existsSync(r.file_path)) || r.file_url || r.direct_url
         ? `/api/recordings/${r.id}/play`
         : undefined;
       return { ...r, media_url, playback_url };
    });

    res.json(records);
  });

  app.delete('/api/recordings/:id', (req, res) => {
    const recording = getRecordingById(req.params.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if (recording.status === 'Recording') return res.status(409).json({ error: 'Cannot delete active recording' });
    deleteRecordingArtifacts(recording);

    db.data.recordings = db.data.recordings.filter((r: RecordingRecord) => r.id !== req.params.id);
    activeConversions.delete(recording.id);
    db.save();
    res.json({ success: true });
  });

  app.delete('/api/recordings', (req, res) => {
    const deletable = db.data.recordings.filter((r: RecordingRecord) => r.status !== 'Recording');
    for (const recording of deletable) {
      deleteRecordingArtifacts(recording);
      activeConversions.delete(recording.id);
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
           recording.direct_url = isDirectMediaUrl(immediateDirect)
             ? immediateDirect
             : await fetchGoFileDirectLink(data.data.downloadPage, recording.gofile_guest_token) || undefined;
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

    const resolved = await ensureRecordingDirectUrl(recording);
    if (!resolved) return res.status(404).json({ error: 'No direct media link found' });

    res.json({ success: true, direct_url: resolved });
  });

  app.get('/api/recordings/:id/play', async (req, res) => {
    const recording = getRecordingById(req.params.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });

    if (recording.file_path && fs.existsSync(recording.file_path)) {
      try {
        const playbackFile = await ensurePlaybackFile(recording);
        if (!playbackFile || !fs.existsSync(playbackFile)) {
          return res.status(404).json({ error: 'No playable local file found' });
        }
        return streamLocalFile(req, res, playbackFile);
      } catch (error) {
        console.error('Local playback preparation error:', error);
        return res.status(502).json({ error: 'Failed to prepare local video playback' });
      }
    }

    const directUrl = await ensureRecordingDirectUrl(recording);
    if (!directUrl) {
      return res.status(404).json({ error: 'No playable source found for this recording' });
    }

    try {
      const upstream = await axios.get(directUrl, {
        responseType: 'stream',
        headers: req.headers.range ? { Range: String(req.headers.range) } : undefined,
        validateStatus: () => true
      });

      res.status(upstream.status);
      const passthroughHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
        'etag',
        'last-modified'
      ];
      for (const header of passthroughHeaders) {
        const value = upstream.headers[header];
        if (value) res.setHeader(header, value);
      }
      if (!upstream.headers['content-type']) {
        res.setHeader('content-type', 'video/mp4');
      }
      upstream.data.pipe(res);
    } catch (error) {
      console.error('Playback proxy error:', error);
      res.status(502).json({ error: 'Failed to load uploaded video' });
    }
  });

  app.get('/api/recordings/:id/stream', (req, res) => {
    const recording = getRecordingById(req.params.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if (!fs.existsSync(recording.file_path)) return res.status(404).json({ error: 'File missing on disk' });
    streamLocalFile(req, res, recording.file_path);
  });

  app.post('/api/recordings/:id/convert-mp4', (req, res) => {
      const recording = db.data.recordings.find((r: RecordingRecord) => r.id === req.params.id);
      if (!recording) return res.status(404).json({ error: 'Recording not found' });
      ensurePlaybackFile(recording)
        .then((outputPath) => res.json({ success: true, output_path: outputPath }))
        .catch((error) => {
          console.error('MP4 conversion failed:', error);
          res.status(500).json({ error: 'Conversion failed' });
        });
  });

  app.get('/api/settings', (req, res) => {
    res.json(db.data.settings);
  });

  const sendArchiverImportSummary = (req: express.Request, res: express.Response) => {
    const summary = readFixedHeyMateSummary();
    if (!summary) return res.status(404).json({ error: 'Archiver import not found' });
    res.json(summary);
  };
  app.get('/api/imports/archiver', sendArchiverImportSummary);
  app.get('/api/imports/fixedheymate', sendArchiverImportSummary);

  app.get('/api/imports/tiktok-downloader', (req, res) => {
    const summary = readTikTokDownloaderSummary();
    if (!summary) return res.status(404).json({ error: 'TikTok downloader script not found' });
    res.json(summary);
  });

  const listArchiverVideos = (req: express.Request, res: express.Response) => {
    reconcileArchiverVideoStatuses();
    res.json(listFixedHeyMateVideos().map(toArchiverResponseVideo));
  };
  app.get('/api/archiver/videos', listArchiverVideos);
  app.get('/api/fixedheymate/videos', listArchiverVideos);

  const getArchiverVideo = (req: express.Request, res: express.Response) => {
    reconcileArchiverVideoStatuses();
    const video = getFixedHeyMateVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(toArchiverResponseVideo(video));
  };
  app.get('/api/archiver/videos/:id', getArchiverVideo);
  app.get('/api/fixedheymate/videos/:id', getArchiverVideo);

  const archiveIntoArchiver = async (req: express.Request, res: express.Response) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'A valid URL is required' });
    }
    try {
      const record = await startFixedHeyMateArchive(url);
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Archive failed' });
    }
  };
  app.post('/api/archiver/archive', archiveIntoArchiver);
  app.post('/api/fixedheymate/archive', archiveIntoArchiver);

  const redownloadArchiver = async (req: express.Request, res: express.Response) => {
    try {
      const video = await redownloadArchiverVideo(req.params.id);
      res.json(video ? toArchiverResponseVideo(video) : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Redownload failed';
      const existing = getFixedHeyMateVideo(req.params.id);
      if (existing) {
        updateFixedHeyMateVideo(existing.id, { status: 'error', error_message: message });
      }
      res.status(500).json({ error: message });
    }
  };
  app.post('/api/archiver/videos/:id/redownload', redownloadArchiver);
  app.post('/api/fixedheymate/videos/:id/redownload', redownloadArchiver);

  const playArchiverVideo = async (req: express.Request, res: express.Response) => {
    reconcileArchiverVideoStatuses();
    const video = getFixedHeyMateVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    const localPath = path.join(FIXED_HEYMATE_STORAGE_DIR, 'videos', `${video.id}.mp4`);

    if (video.storage_type === 'local') {
      if (fs.existsSync(localPath)) {
        if (video.status !== 'ready' || video.error_message) {
          updateFixedHeyMateVideo(video.id, { status: 'ready', error_message: null });
        }
        streamLocalFile(req, res, localPath);
        return;
      }

      if (video.status === 'archiving') {
        return res.status(409).json({ error: 'Archiving is still in progress. Try again shortly.' });
      }

      if (video.source_url) {
        updateFixedHeyMateVideo(video.id, {
          status: 'archiving',
          error_message: 'Local archive missing. Re-archiving started.'
        });
        startFixedHeyMateArchive(video.source_url).catch((error) => {
          updateFixedHeyMateVideo(video.id, {
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Re-archive failed'
          });
        });
        return res.status(404).json({ error: 'Local archive file missing. Re-archiving started.' });
      }

      updateFixedHeyMateVideo(video.id, {
        status: 'error',
        error_message: 'Local archive file missing and source URL unavailable.'
      });
      return res.status(404).json({ error: 'Local archive file missing' });
    }

    const remoteUrl = video.source_url || video.playback_url;
    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) {
      updateFixedHeyMateVideo(video.id, {
        status: 'error',
        error_message: 'Remote source URL unavailable'
      });
      return res.status(404).json({ error: 'Remote source unavailable' });
    }

    try {
      const upstream = await axios.get(remoteUrl, {
        responseType: 'stream',
        headers: req.headers.range ? { Range: String(req.headers.range) } : undefined,
        validateStatus: () => true,
        maxRedirects: 5,
        timeout: 15000
      });

      if (upstream.status >= 400) {
        updateFixedHeyMateVideo(video.id, {
          status: 'error',
          error_message: `Remote archive unavailable (HTTP ${upstream.status})`
        });
        return res.status(404).json({ error: 'Remote archive unavailable' });
      }

      res.status(upstream.status);
      const passthroughHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
        'etag',
        'last-modified'
      ];
      for (const header of passthroughHeaders) {
        const value = upstream.headers[header];
        if (value) res.setHeader(header, value);
      }
      if (!upstream.headers['content-type']) {
        res.setHeader('content-type', 'video/mp4');
      }
      if (!upstream.headers['accept-ranges']) {
        res.setHeader('accept-ranges', 'bytes');
      }
      upstream.data.pipe(res);
      return;
    } catch (error) {
      updateFixedHeyMateVideo(video.id, {
        status: 'error',
        error_message: 'Remote archive proxy failed'
      });
      return res.status(502).json({ error: 'Failed to stream remote archive' });
    }
  };
  app.get('/api/archiver/videos/:id/play', playArchiverVideo);
  app.get('/api/fixedheymate/videos/:id/play', playArchiverVideo);

  app.post('/api/tiktok-downloader/jobs', (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }
    const job = startTikTokDownloadJob(username);
    res.json(job);
  });

  app.get('/api/tiktok-downloader/jobs', (req, res) => {
    res.json(listTikTokJobs());
  });

  app.get('/api/tiktok-downloader/jobs/:id', (req, res) => {
    const job = getTikTokJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.get('/api/tiktok-downloader/jobs/:id/download', (req, res) => {
    const job = getTikTokJob(req.params.id);
    if (!job || !job.zip_path) return res.status(404).json({ error: 'Download not available' });
    if (!fs.existsSync(job.zip_path)) return res.status(404).json({ error: 'Zip file missing' });
    res.download(job.zip_path);
  });

  app.delete('/api/tiktok-downloader/jobs/:id', (req, res) => {
    const job = getTikTokJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.zip_path && fs.existsSync(job.zip_path)) {
      try { fs.unlinkSync(job.zip_path); } catch {}
    }
    if (job.output_dir && fs.existsSync(job.output_dir)) {
      try { fs.rmSync(job.output_dir, { recursive: true, force: true }); } catch {}
    }
    tiktokDownloaderDb.data.jobs = tiktokDownloaderDb.data.jobs.filter((j) => j.id !== req.params.id);
    tiktokDownloaderDb.save();
    res.json({ ok: true });
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
    const destDir = path.isAbsolute(rawDir) ? rawDir : path.join(APP_ROOT, rawDir);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    express.static(destDir)(req, res, next);
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV === "development") {
    try {
      const { createServer: createViteServer } = await import('vite');
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
    const distPath = path.join(APP_ROOT, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

let cachedApp: express.Express | null = null;
async function getApp() {
  if (cachedApp) return cachedApp;
  cachedApp = await createApp();
  return cachedApp;
}

if (!process.env.VERCEL) {
  getApp()
    .then((app) => {
      const port = Number(process.env.PORT || 3000);
      app.listen(port, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${port}`);
      });
    })
    .catch(console.error);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  return (app as any)(req, res);
}

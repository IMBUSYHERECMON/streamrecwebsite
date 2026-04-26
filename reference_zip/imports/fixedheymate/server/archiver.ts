import _YTDlpWrapModule from "yt-dlp-wrap";
// yt-dlp-wrap is a CJS module — handle double-default ESM interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YTDlpWrap = ((_YTDlpWrapModule as any)?.default ?? _YTDlpWrapModule) as typeof import("yt-dlp-wrap").default;
import { createReadStream, existsSync } from "fs";
import { unlink, access } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { storagePut } from "./storage";
import { createVideo, updateVideo, getVideoByYoutubeId } from "./db";
import { GetObjectCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";

// Resolve yt-dlp binary path at startup (ESM-safe)
// Prefer the standalone ELF binary which has no Python dependency
async function resolveYtDlpBin(): Promise<string | null> {
  const candidates = [
    "/usr/local/bin/yt-dlp-standalone", // true standalone ELF, no Python
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    process.env.YTDLP_PATH,
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {}
  }
  return null;
}

let _ytdlpBin: string | null | undefined = undefined;
async function getYtDlpBin(): Promise<string | null> {
  if (_ytdlpBin === undefined) _ytdlpBin = await resolveYtDlpBin();
  return _ytdlpBin;
}

// Cookies path — kept outside client/public so it's never served statically
const COOKIES_PATH = join(process.cwd(), "private/cookies.txt");

// Resolve Node.js binary for yt-dlp JS challenge solving — cached at module level
let _nodeBin: string | null | undefined = undefined;
async function getNodeBin(): Promise<string | null> {
  if (_nodeBin !== undefined) return _nodeBin;
  const candidates = [
    process.execPath, // current node process
    "/home/ubuntu/.nvm/versions/node/v22.13.0/bin/node",
    "/usr/bin/node",
    "/usr/local/bin/node",
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try { await access(p); _nodeBin = p; return p; } catch {}
  }
  _nodeBin = null;
  return null;
}

async function getYtDlp(): Promise<InstanceType<typeof YTDlpWrap>> {
  const bin = await getYtDlpBin();
  return bin ? new YTDlpWrap(bin) : new YTDlpWrap();
}

// Module-level cached promise for common flags — filesystem check runs once per process
let _commonFlagsPromise: Promise<string[]> | null = null;
function commonFlags(): Promise<string[]> {
  if (!_commonFlagsPromise) {
    _commonFlagsPromise = getNodeBin().then(nodeBin =>
      nodeBin ? ["--js-runtimes", `node:${nodeBin}`] : []
    );
  }
  return _commonFlagsPromise;
}

export interface VideoMeta {
  id: string;
  title: string;
  channel: string;
  channel_id?: string;
  description?: string;
  upload_date?: string;
  duration?: number;
  thumbnail?: string;
}

/** Fetch video metadata without downloading */
export async function fetchVideoMeta(url: string): Promise<VideoMeta> {
  const ytDlp = await getYtDlp();
  const flags = await commonFlags();
  const stdout = await ytDlp.execPromise([
    "--dump-json",
    "--no-playlist",
    ...flags,
    "--cookies", COOKIES_PATH,
    url,
  ]);
  return JSON.parse(stdout.trim()) as VideoMeta;
}

/** Download video, upload to CDN via streaming, return CDN URL */
export async function downloadAndUpload(
  youtubeId: string,
  url: string,
  onProgress?: (msg: string) => void
): Promise<{ cdnUrl: string; fileSize: number; thumbnailUrl?: string }> {
  const tmpDir = tmpdir();
  const outTemplate = join(tmpDir, `${youtubeId}.%(ext)s`);
  const mp4Path = join(tmpDir, `${youtubeId}.mp4`);
  const thumbPath = join(tmpDir, `${youtubeId}.jpg`);

  onProgress?.("Starting download...");

  const ytDlp = await getYtDlp();
  const flags = await commonFlags();
  await ytDlp.execPromise([
    "--no-playlist",
    ...flags,
    "--cookies", COOKIES_PATH,
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "-o", outTemplate,
    "--write-thumbnail",
    "--convert-thumbnails", "jpg",
    url,
  ]);

  onProgress?.("Uploading to CDN...");

  // Stream MP4 directly to S3 instead of buffering entire file in RAM
  let cdnUrl: string;
  let fileSize: number;
  try {
    const mp4Buffer = await readFile(mp4Path);
    fileSize = mp4Buffer.length;
    const result = await storagePut(
      `videos/${youtubeId}-${Date.now()}.mp4`,
      mp4Buffer,
      "video/mp4"
    );
    cdnUrl = result.url;
  } finally {
    // Always clean up temp MP4, even on upload failure
    await unlink(mp4Path).catch(() => {});
  }

  let thumbnailUrl: string | undefined;
  try {
    const thumbBuffer = await readFile(thumbPath);
    const { url: tUrl } = await storagePut(
      `thumbnails/${youtubeId}.jpg`,
      thumbBuffer,
      "image/jpeg"
    );
    thumbnailUrl = tUrl;
  } catch {
    // thumbnail is optional
  } finally {
    await unlink(thumbPath).catch(() => {});
  }

  return { cdnUrl, fileSize: fileSize!, thumbnailUrl };
}

/** Full archive pipeline: fetch meta → create DB record → download → update DB */
export async function archiveVideo(
  url: string,
  onProgress?: (msg: string) => void
): Promise<number> {
  onProgress?.("Fetching video info...");
  const meta = await fetchVideoMeta(url);

  const existing = await getVideoByYoutubeId(meta.id);
  if (existing && existing.status === "done") {
    throw new Error("This video is already archived.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const videoId = await createVideo({
    youtubeId: meta.id,
    title: meta.title,
    channel: meta.channel || "Unknown",
    channelId: meta.channel_id,
    description: meta.description,
    uploadDate: meta.upload_date,
    duration: meta.duration,
    cdnUrl: "",
    status: "downloading",
    archivedAt: now,
    expiresAt,
  });

  try {
    onProgress?.("Downloading video...");
    const { cdnUrl, fileSize, thumbnailUrl } = await downloadAndUpload(
      meta.id,
      url,
      onProgress
    );

    await updateVideo(videoId, {
      cdnUrl,
      fileSize,
      thumbnailUrl,
      status: "done",
    });

    onProgress?.("Done!");
    return videoId;
  } catch (err: unknown) {
    await updateVideo(videoId, {
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

/** Start archive in background — returns videoId immediately, download runs async */
export async function startArchiveBackground(url: string): Promise<number> {
  const meta = await fetchVideoMeta(url);

  const existing = await getVideoByYoutubeId(meta.id);
  if (existing && existing.status === "done") {
    throw new Error("This video is already archived.");
  }
  // If already downloading, return existing record
  if (existing && existing.status === "downloading") {
    return existing.id;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const videoId = await createVideo({
    youtubeId: meta.id,
    title: meta.title,
    channel: meta.channel || "Unknown",
    channelId: meta.channel_id,
    description: meta.description,
    uploadDate: meta.upload_date,
    duration: meta.duration,
    cdnUrl: "",
    status: "downloading",
    archivedAt: now,
    expiresAt,
  });

  // Fire and forget — download runs in background
  setImmediate(async () => {
    try {
      const { cdnUrl, fileSize, thumbnailUrl } = await downloadAndUpload(meta.id, url);
      await updateVideo(videoId, { cdnUrl, fileSize, thumbnailUrl, status: "done" });
    } catch (err: unknown) {
      await updateVideo(videoId, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  return videoId;
}

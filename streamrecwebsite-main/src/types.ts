export type AppTab =
  | 'dashboard'
  | 'media'
  | 'settings'
  | 'archiver'
  | 'tiktok-downloader';

export interface Streamer {
  id: string;
  name: string;
  url: string;
  check_interval_seconds: number;
  state: 'offline' | 'checking' | 'live';
  last_seen_live_at: string | null;
  manual_start_required?: boolean;
}

export type RecordingStatus =
  | 'Recording'
  | 'Failed'
  | 'Completed'
  | 'Uploading...'
  | 'Uploaded'
  | 'Upload Failed'
  | 'Abandoned';

export interface Recording {
  id: string;
  streamer_id: string;
  streamer_name: string;
  status: RecordingStatus;
  started_at: string;
  finished_at: string | null;
  file_url?: string;
  direct_url?: string;
  file_name?: string;
  media_url?: string;
  playback_url?: string;
  file_path?: string;
  stop_reason?: 'manual' | 'stream-ended' | 'failed' | 'unknown';
}

export interface AppSettings {
  webhook_url: string;
  download_dir: string;
}

export interface ApiStatus {
  counts: { live: number; monitored: number; recordings: number };
  recorder?: RecorderStatus;
}

export interface RecorderDependency {
  ready: boolean;
  source: string;
  path: string | null;
}

export interface RecorderStatus {
  ready: boolean;
  missing: string[];
  dependencies: {
    yt_dlp: RecorderDependency;
    ffmpeg: RecorderDependency;
    streamlink: RecorderDependency;
  };
}

export interface FixedHeyMateVideo {
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

export interface DiscordImportParsedEntry {
  titleLine: string;
  title: string;
  upload_date: string | null;
  channel: string;
  url: string;
  baseUrl: string;
}

export interface TikTokDownloadJob {
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

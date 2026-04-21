export type AppTab = 'dashboard' | 'media' | 'settings';

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
  file_path?: string;
  stop_reason?: 'manual' | 'stream-ended' | 'failed' | 'unknown';
}

export interface AppSettings {
  webhook_url: string;
  download_dir: string;
}

export interface ApiStatus {
  counts: { live: number; monitored: number; recordings: number };
}

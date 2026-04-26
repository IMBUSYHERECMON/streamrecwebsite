// API base URL - points to the backend API server
export const API_BASE = "/api";

export interface Video {
  id: number;
  title: string;
  channelName?: string;
  channelId?: number;
  uploadDate?: string;
  downloadedAt?: string;
  fileSize?: number;
  hasThumbnail: boolean;
  youtubeId?: string;
}

export interface Channel {
  id: number;
  name: string;
  channelId: string;
  isMonitoring: boolean;
  videoCount: number;
  lastCheckedAt?: string;
}

export interface ArchiverStatus {
  totalVideos: number;
  totalChannels: number;
  monitoringChannels: number;
  currentlyDownloading: boolean;
  logs?: string[];
}

export interface HealthStatus {
  status: string;
}

// API fetch helpers
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

export const api = {
  health: () => apiFetch<HealthStatus>("/health"),
  listVideos: (channelDbId?: number) =>
    apiFetch<Video[]>(channelDbId ? `/videos?channelDbId=${channelDbId}` : "/videos"),
  getVideo: (id: number) => apiFetch<Video>(`/videos/${id}`),
  listChannels: () => apiFetch<Channel[]>("/channels"),
  addChannel: (url: string) =>
    apiFetch<Channel>("/channels", { method: "POST", body: JSON.stringify({ url }) }),
  removeChannel: (id: number) =>
    apiFetch<void>(`/channels/${id}`, { method: "DELETE" }),
  startMonitoring: (id: number) =>
    apiFetch<void>(`/channels/${id}/start`, { method: "POST" }),
  stopMonitoring: (id: number) =>
    apiFetch<void>(`/channels/${id}/stop`, { method: "POST" }),
  scanChannel: (id: number) =>
    apiFetch<void>(`/channels/${id}/scan`, { method: "POST" }),
  getArchiverStatus: () => apiFetch<ArchiverStatus>("/archiver/status"),
  clearLogs: () => apiFetch<void>("/archiver/logs", { method: "DELETE" }),
};

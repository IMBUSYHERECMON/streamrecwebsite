import React, { useState, useEffect, useCallback } from 'react';
import {
  Play, Square, Trash2, Video, HardDrive, Bell,
  Settings, Plus, RotateCw, Activity, AlertCircle,
  RefreshCw, Download, MonitorPlay, FileVideo,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

type StreamerState = 'offline' | 'checking' | 'live';
type RecordingStatus = 'Recording' | 'Completed' | 'Failed' | 'Abandoned';
type ActiveTab = 'dashboard' | 'media' | 'settings';

interface Streamer {
  id: string;
  name: string;
  url: string;
  check_interval_seconds: number;
  state: StreamerState;
  last_seen_live_at: string | null;
  manual_start_required: boolean;
}

interface Recording {
  id: string;
  streamer_id: string;
  streamer_name: string;
  status: RecordingStatus;
  started_at: string;
  finished_at: string | null;
  file_path: string;
  file_name?: string;
  folder_url: string | null;
}

interface AppSettings {
  webhook_url: string;
  download_dir: string;
}

interface ApiStatus {
  counts: { live: number; monitored: number; recordings: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the URL to stream/download a recording directly from the Express
 * /media static route. Returns null if file_name cannot be determined.
 */
function mediaUrl(r: Recording): string | null {
  const name = r.file_name || r.file_path?.split(/[/\\]/).pop();
  if (!name) return null;
  return `/media/${encodeURIComponent(name)}`;
}

// ─── VideoCard ────────────────────────────────────────────────────────────────

/**
 * Inline HTML5 video player used in the Media Library cards.
 * express.static handles HTTP range requests so seeking works instantly
 * without buffering the whole file first.
 * Falls back gracefully if the file is missing from disk.
 */
function VideoCard({ recording }: { recording: Recording }) {
  const url = mediaUrl(recording);
  const [broken, setBroken] = useState(false);
  const filename = recording.file_name || recording.file_path?.split(/[/\\]/).pop() || 'Unknown';

  if (!url || broken) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 bg-black/40 rounded-lg border border-[var(--color-border-subtle)] text-zinc-600">
        <FileVideo className="w-8 h-8 opacity-40" aria-hidden="true" />
        <span className="text-xs">File not available on disk</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-[var(--color-border-subtle)] bg-black">
      <video
        src={url}
        controls
        preload="metadata"
        className="w-full block"
        style={{ maxHeight: '200px', objectFit: 'contain' }}
        onError={() => setBroken(true)}
        aria-label={`Recording of ${recording.streamer_name}`}
      />
      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-border-subtle)]">
        <span
          className="text-[11px] font-mono text-zinc-500 truncate max-w-[60%]"
          title={filename}
        >
          {filename}
        </span>
        <a
          href={url}
          download={filename}
          className="flex items-center gap-1.5 text-[10px] uppercase font-semibold tracking-wide text-zinc-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 rounded"
          aria-label={`Download ${filename}`}
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Download
        </a>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── State ─────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ webhook_url: '', download_dir: '' });
  const [status, setStatus] = useState<ApiStatus>({ counts: { live: 0, monitored: 0, recordings: 0 } });

  const [apiError, setApiError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [newStreamer, setNewStreamer] = useState({
    name: '',
    url: '',
    check_interval_seconds: 300,
  });

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);

    const processRes = async <T,>(res: Response | null): Promise<T | null> => {
      if (!res) return null;
      if (!res.ok) { console.error(`API ${res.status} — ${res.url}`); return null; }
      try { return (await res.json()) as T; }
      catch (e) { console.error(`JSON parse — ${res.url}:`, e); return null; }
    };

    try {
      const [sRes, rRes, setRes, statRes] = await Promise.all([
        fetch('/api/streamers').catch(() => null),
        fetch('/api/recordings').catch(() => null),
        fetch('/api/settings').catch(() => null),
        fetch('/api/status').catch(() => null),
      ]);

      if (!sRes && !rRes && !setRes && !statRes) {
        setApiError('Cannot reach the server. Is it running?');
      } else {
        setApiError(null);
      }

      const s = await processRes<Streamer[]>(sRes);    if (s) setStreamers(s);
      const r = await processRes<Recording[]>(rRes);   if (r) setRecordings(r);
      const sv = await processRes<AppSettings>(setRes); if (sv) setSettings(sv);
      const st = await processRes<ApiStatus>(statRes);  if (st) setStatus(st);
    } catch (err) {
      console.error('Fetch error:', err);
      setApiError('Unexpected error while fetching data.');
    } finally {
      if (showRefreshing) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddStreamer = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/streamers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStreamer),
    });
    setNewStreamer({ name: '', url: '', check_interval_seconds: 300 });
    fetchData();
  };

  const handleDeleteStreamer = async (id: string) => {
    await fetch(`/api/streamers/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleStartStreamer = async (id: string) => {
    await fetch(`/api/streamers/${id}/start`, { method: 'POST' });
    fetchData();
  };

  const handleStopRecording = async (id: string) => {
    await fetch(`/api/recordings/${id}/stop`, { method: 'POST' });
    fetchData();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    fetchData();
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeRecordings = recordings.filter((r) => r.status === 'Recording');
  const pastRecordings   = recordings.filter((r) => r.status !== 'Recording');
  const liveCount        = status?.counts?.live ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-full bg-[var(--color-bg-base)] text-[var(--color-text-primary)] font-sans overflow-hidden">

      {/* Sidebar */}
      <aside className="w-[260px] border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-6 flex flex-col shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center" aria-hidden="true">
            <div className="w-3 h-3 bg-white rounded-full" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">StreamRecorder</h1>
        </div>

        <nav className="space-y-6" aria-label="Main navigation">
          <div className="space-y-2 flex flex-col">
            <p className="metric-label px-2">Navigation</p>
            {(
              [
                { tab: 'dashboard' as const, label: 'Dashboard', icon: <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" /> },
                { tab: 'media'     as const, label: 'Media',     icon: <Video className="w-4 h-4" aria-hidden="true" /> },
                { tab: 'settings'  as const, label: 'Settings',  icon: <Settings className="w-4 h-4" aria-hidden="true" /> },
              ]
            ).map(({ tab, label, icon }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
                className={`flex items-center gap-3 px-2 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === tab ? 'bg-zinc-800/50 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <p className="metric-label px-2">Stats</p>
            {[
              { label: 'Monitored',  value: status?.counts?.monitored  ?? 0 },
              { label: 'Recordings', value: status?.counts?.recordings ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="px-2 py-1 flex items-center justify-between text-sm text-zinc-500">
                <span>{label}</span>
                <span className="text-white font-mono">{value}</span>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">

        {/* Header */}
        <header className="h-[64px] border-b border-[var(--color-border-subtle)] bg-zinc-950/50 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-8">
            <div>
              <p className="metric-label">Global Status</p>
              <p className="text-emerald-500 text-sm font-medium">Operational</p>
            </div>
            <div className="h-8 w-[1px] bg-zinc-800" aria-hidden="true" />
            <div>
              <p className="metric-label">Active Tasks</p>
              <p className="text-white text-sm font-medium flex items-center gap-2">
                {liveCount > 0 ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 status-recording" aria-hidden="true" />
                    {liveCount} LIVE
                  </>
                ) : '0 LIVE'}
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            aria-label="Refresh data"
            className="p-2 text-zinc-500 hover:text-white transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </header>

        {/* Error Banner */}
        {apiError && (
          <div role="alert" className="flex items-center gap-3 px-6 py-3 bg-red-950/60 border-b border-red-900/40 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{apiError}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">

            {/* ── Settings ────────────────────────────────────────────────── */}
            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <form onSubmit={handleSaveSettings} className="glass rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Bell className="w-5 h-5 text-zinc-400" aria-hidden="true" />
                    <h2 className="text-sm font-medium text-white">Discord Webhook</h2>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      aria-label="Discord webhook URL"
                      className="flex-1 bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus:border-zinc-500 transition-colors placeholder:text-zinc-600"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={settings.webhook_url || ''}
                      onChange={(e) => setSettings({ ...settings, webhook_url: e.target.value })}
                    />
                    <button type="submit" className="btn-primary">Save</button>
                  </div>
                </form>

                <form onSubmit={handleSaveSettings} className="glass rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <HardDrive className="w-5 h-5 text-zinc-400" aria-hidden="true" />
                    <h2 className="text-sm font-medium text-white">Recording Directory</h2>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      aria-label="Recording directory path"
                      className="flex-1 bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus:border-zinc-500 transition-colors placeholder:text-zinc-600"
                      placeholder="data/recordings or /path/to/files"
                      value={settings.download_dir || ''}
                      onChange={(e) => setSettings({ ...settings, download_dir: e.target.value })}
                    />
                    <button type="submit" className="btn-primary">Save</button>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-600 leading-relaxed">
                    Files in this folder are served directly at{' '}
                    <code className="text-zinc-500 bg-zinc-900 px-1 rounded">/media/&lt;filename&gt;</code>
                    {' '}— no upload needed.
                  </p>
                </form>
              </div>
            )}

            {/* ── Media Library ────────────────────────────────────────────── */}
            {activeTab === 'media' && (
              <div className="glass rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white flex items-center gap-2">
                    <Video className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                    Media Library
                  </h2>
                  <span className="metric-label">
                    {pastRecordings.length} recording{pastRecordings.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pastRecordings.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3 text-zinc-600">
                      <FileVideo className="w-10 h-10 opacity-30" aria-hidden="true" />
                      <p className="text-sm italic">No recordings saved yet.</p>
                    </div>
                  ) : (
                    pastRecordings.map((r) => (
                      <div
                        key={r.id}
                        className="bg-zinc-900/50 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] p-4 flex flex-col gap-3"
                      >
                        {/* Header */}
                        <div>
                          <div
                            className="font-medium text-[var(--color-text-primary)] truncate"
                            title={r.streamer_name}
                          >
                            {r.streamer_name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-500 font-mono">
                              {r.finished_at
                                ? format(new Date(r.finished_at), 'MMM dd · HH:mm:ss')
                                : '—'}
                            </span>
                            <span className={`text-[10px] uppercase tracking-wider font-semibold ${
                              r.status === 'Completed' ? 'text-emerald-600' :
                              r.status === 'Failed'    ? 'text-red-600'     : 'text-zinc-600'
                            }`}>
                              {r.status}
                            </span>
                          </div>
                        </div>

                        {/* Player */}
                        <VideoCard recording={r} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Dashboard ────────────────────────────────────────────────── */}
            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

                {/* Left: Streamers */}
                <div className="space-y-6">
                  <div className="glass rounded-xl p-6">
                    <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-zinc-400" aria-hidden="true" /> Add Streamer
                    </h2>
                    <form
                      onSubmit={handleAddStreamer}
                      className="grid grid-cols-1 md:grid-cols-[1fr,2fr,auto,auto] gap-3"
                    >
                      <input
                        placeholder="Name (optional)"
                        aria-label="Streamer name"
                        className="bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-500 outline-none placeholder:text-zinc-600"
                        value={newStreamer.name}
                        onChange={(e) => setNewStreamer({ ...newStreamer, name: e.target.value })}
                      />
                      <input
                        required
                        placeholder="URL or Handle"
                        aria-label="Streamer URL or handle"
                        className="bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-500 outline-none placeholder:text-zinc-600"
                        value={newStreamer.url}
                        onChange={(e) => setNewStreamer({ ...newStreamer, url: e.target.value })}
                      />
                      <input
                        type="number"
                        min={30}
                        placeholder="Int (s)"
                        aria-label="Check interval in seconds"
                        className="bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-500 outline-none w-20 placeholder:text-zinc-600"
                        value={newStreamer.check_interval_seconds || ''}
                        onChange={(e) =>
                          setNewStreamer({ ...newStreamer, check_interval_seconds: parseInt(e.target.value) || 300 })
                        }
                      />
                      <button type="submit" className="btn-primary whitespace-nowrap px-4 py-2">
                        Add Target
                      </button>
                    </form>
                  </div>

                  <div className="glass rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <h2 className="text-sm font-medium text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-zinc-400" aria-hidden="true" /> Monitored Streamers
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="metric-label bg-black/40 border-b border-[var(--color-border-subtle)]">
                          <tr>
                            <th className="px-5 py-3 font-medium" scope="col">Target</th>
                            <th className="px-5 py-3 font-medium" scope="col">Status</th>
                            <th className="px-5 py-3 font-medium" scope="col">Last Seen</th>
                            <th className="px-5 py-3 font-medium text-right" scope="col">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {streamers.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-5 py-6 text-center text-zinc-600 italic">
                                No streamers configured yet.
                              </td>
                            </tr>
                          ) : streamers.map((s) => (
                            <tr key={s.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-5 py-3">
                                <div className="font-medium text-[var(--color-text-primary)]">{s.name || s.url}</div>
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono tracking-tight"
                                >
                                  {s.url}
                                </a>
                              </td>
                              <td className="px-5 py-3">
                                {s.state === 'live' ? (
                                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-red-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 status-recording" aria-hidden="true" />
                                    LIVE
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
                                    {s.state}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-zinc-500 font-mono text-[11px]">
                                {s.last_seen_live_at
                                  ? formatDistanceToNow(new Date(s.last_seen_live_at), { addSuffix: true })
                                  : '-'}
                              </td>
                              <td className="px-5 py-3 flex items-center justify-end gap-3">
                                <button
                                  onClick={() => handleStartStreamer(s.id)}
                                  aria-label={`Force-check ${s.name || s.url}`}
                                  className="text-zinc-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 rounded"
                                >
                                  <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStreamer(s.id)}
                                  aria-label={`Delete ${s.name || s.url}`}
                                  className="text-zinc-500 hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                                >
                                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right: Recordings */}
                <div className="space-y-6">

                  {/* Active recordings */}
                  <div className="glass rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <h2 className="text-sm font-medium text-white flex items-center gap-2">
                        <RotateCw
                          className={`w-4 h-4 ${activeRecordings.length > 0 ? 'text-red-500 animate-spin' : 'text-zinc-400'}`}
                          aria-hidden="true"
                        />
                        Active Recordings
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="metric-label bg-black/40 border-b border-[var(--color-border-subtle)]">
                          <tr>
                            <th className="px-5 py-3 font-medium" scope="col">Streamer</th>
                            <th className="px-5 py-3 font-medium" scope="col">Started</th>
                            <th className="px-5 py-3 font-medium text-right" scope="col">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {activeRecordings.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-5 py-6 text-center text-zinc-600 italic">
                                No active recordings right now.
                              </td>
                            </tr>
                          ) : activeRecordings.map((r) => (
                            <tr key={r.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">
                                {r.streamer_name}
                              </td>
                              <td className="px-5 py-3 text-zinc-500 font-mono text-[11px]">
                                {format(new Date(r.started_at), 'HH:mm:ss')}
                              </td>
                              <td className="px-5 py-3 flex justify-end">
                                <button
                                  onClick={() => handleStopRecording(r.id)}
                                  aria-label={`Stop recording for ${r.streamer_name}`}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded border border-red-500/20 hover:border-red-500/30 transition-all text-[10px] uppercase tracking-wider font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                >
                                  <Square className="w-3 h-3 fill-current" aria-hidden="true" /> Stop
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Past recordings */}
                  <div className="glass rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <h2 className="text-sm font-medium text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-zinc-400" aria-hidden="true" /> Recorded Videos
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="metric-label bg-black/40 border-b border-[var(--color-border-subtle)]">
                          <tr>
                            <th className="px-5 py-3 font-medium" scope="col">Streamer</th>
                            <th className="px-5 py-3 font-medium" scope="col">Finished</th>
                            <th className="px-5 py-3 font-medium" scope="col">File</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)]">
                          {pastRecordings.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-5 py-6 text-center text-zinc-600 italic">
                                No recording history yet.
                              </td>
                            </tr>
                          ) : pastRecordings.map((r) => {
                            const url = mediaUrl(r);
                            const filename = r.file_name || r.file_path?.split(/[/\\]/).pop() || '';
                            return (
                              <tr key={r.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">
                                  {r.streamer_name}
                                  <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${
                                    r.status === 'Completed' ? 'text-emerald-700' :
                                    r.status === 'Failed'    ? 'text-red-700'     : 'text-zinc-600'
                                  }`}>
                                    {r.status}
                                  </div>
                                </td>
                                <td className="px-5 py-3 text-zinc-500 font-mono text-[11px]">
                                  {r.finished_at ? format(new Date(r.finished_at), 'MM/dd HH:mm') : '-'}
                                </td>
                                <td className="px-5 py-3">
                                  {url ? (
                                    <div className="flex items-center gap-3">
                                      {/* Opens in browser's native full-screen player */}
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        aria-label={`Play ${filename} in browser`}
                                        title="Play in browser"
                                        className="text-zinc-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 rounded"
                                      >
                                        <MonitorPlay className="w-4 h-4" aria-hidden="true" />
                                      </a>
                                      {/* Triggers browser Save-As dialog */}
                                      <a
                                        href={url}
                                        download={filename}
                                        aria-label={`Download ${filename}`}
                                        title="Download"
                                        className="text-zinc-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 rounded"
                                      >
                                        <Download className="w-4 h-4" aria-hidden="true" />
                                      </a>
                                      <span
                                        className="text-[10px] font-mono text-zinc-600 truncate max-w-[130px]"
                                        title={filename}
                                      >
                                        {filename}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-mono text-zinc-700 italic">No file</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="h-[40px] border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-6 text-xs text-zinc-500 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="metric-label">Storage dir:</span>
            <code className="font-mono text-zinc-400">{settings.download_dir || 'data/recordings'}</code>
          </div>
          <div className="flex items-center gap-1.5 metric-label text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            System: Operational
          </div>
        </footer>
      </main>
    </div>
  );
}

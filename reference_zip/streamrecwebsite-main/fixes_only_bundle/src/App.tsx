import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Square, Trash2, Video, HardDrive, Bell, Settings, Plus, RotateCw, MonitorPlay, Activity, RefreshCw } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface Streamer {
  id: string;
  name: string;
  url: string;
  check_interval_seconds: number;
  state: string;
  last_seen_live_at: string | null;
}

interface Recording {
  id: string;
  streamer_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  file_url?: string;
  direct_url?: string;
  file_name?: string;
  media_url?: string;
  stop_reason?: 'manual' | 'stream-ended' | 'failed' | 'unknown';
  file_path?: string;
}

interface AppSettings {
  webhook_url: string;
  download_dir: string;
}

interface ApiStatus {
  counts?: { live: number; monitored: number; recordings: number };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard'|'media'|'settings'>('dashboard');
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ webhook_url: '', download_dir: '' });
  const [status, setStatus] = useState<ApiStatus>({ counts: { live: 0, monitored: 0, recordings: 0 } });
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<Record<string, boolean>>({});
  const [busyStreamerId, setBusyStreamerId] = useState<string | null>(null);
  
  // Forms
  const [newStreamer, setNewStreamer] = useState({ name: '', url: '', check_interval_seconds: 300 });

  const fetchData = useCallback(async () => {
    try {
      const controller = new AbortController();
      const responses = await Promise.all([
        fetch('/api/streamers', { signal: controller.signal }).catch(e => { console.error('streamers err:', e); return null; }),
        fetch('/api/recordings', { signal: controller.signal }).catch(e => { console.error('rec err:', e); return null; }),
        fetch('/api/settings', { signal: controller.signal }).catch(e => { console.error('set err:', e); return null; }),
        fetch('/api/status', { signal: controller.signal }).catch(e => { console.error('stat err:', e); return null; })
      ]);

      if (!responses[0] && !responses[1] && !responses[2] && !responses[3]) {
         setApiError("The service is temporarily unavailable. Please try again.");
      } else {
         setApiError(null);
      }

      const processRes = async (res: Response | null) => {
        if (!res) return null;
        if (!res.ok) {
           console.error(`API Error ${res.status} on ${res.url}`);
           return null;
        }
        try {
          return await res.json();
        } catch (e) {
          console.error(`JSON Parse Error on ${res.url}:`, e);
          return null;
        }
      };

      const sData = await processRes(responses[0] as Response | null);
      if (sData) {
        setStreamers(prev => JSON.stringify(prev) === JSON.stringify(sData) ? prev : sData);
      }
      
      const rData = await processRes(responses[1] as Response | null);
      if (rData) {
        setRecordings(prev => JSON.stringify(prev) === JSON.stringify(rData) ? prev : rData);
      }

      const setVal = await processRes(responses[2] as Response | null);
      if (setVal) {
        setSettings(prev => JSON.stringify(prev) === JSON.stringify(setVal) ? prev : setVal);
      }

      const statVal = await processRes(responses[3] as Response | null);
      if (statVal) {
        setStatus(prev => JSON.stringify(prev) === JSON.stringify(statVal) ? prev : statVal);
      }

    } catch(err) {
      console.error("Global fetch error:", err);
      setApiError("A critical error occurred while fetching data.");
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAddStreamer = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/streamers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStreamer)
    });
    setNewStreamer({ name: '', url: '', check_interval_seconds: 300 });
    fetchData();
  };

  const handleDeleteStreamer = async (id: string) => {
    await fetch(`/api/streamers/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleStartStreamer = async (id: string) => {
    setBusyStreamerId(id);
    await fetch(`/api/streamers/${id}/start`, { method: 'POST' });
    setBusyStreamerId(null);
    fetchData();
  };

  const handleStopStreamer = async (id: string) => {
    setBusyStreamerId(id);
    await fetch(`/api/streamers/${id}/stop`, { method: 'POST' });
    setBusyStreamerId(null);
    fetchData();
  };

  const handleStopRecording = async (id: string) => {
    await fetch(`/api/recordings/${id}/stop`, { method: 'POST' });
    fetchData();
  };

  const handleUpload = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: 'Uploading...' } as Recording : r));
    setLoadingMedia(prev => ({ ...prev, [id]: true }));
    await fetch(`/api/recordings/${id}/upload`, { method: 'POST' });
    setTimeout(() => {
      fetchData();
      setLoadingMedia(prev => ({ ...prev, [id]: false }));
    }, 1200);
    fetchData();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    fetchData();
  }

  const handleDeleteRecording = async (id: string) => {
    await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleDeleteAllRecordings = async () => {
    await fetch('/api/recordings', { method: 'DELETE' });
    fetchData();
  };

  const handleResolveDirectUrl = async (id: string) => {
    const res = await fetch(`/api/recordings/${id}/resolve-direct-url`, { method: 'POST' });
    if (!res.ok) return;
    const payload = await res.json();
    if (payload?.direct_url) {
      setRecordings(prev => prev.map(r => r.id === id ? { ...r, direct_url: payload.direct_url } : r));
    }
  };

  const activeRecordings = useMemo(() => recordings.filter(r => r.status === 'Recording'), [recordings]);
  const pastRecordings = useMemo(() => recordings.filter(r => r.status !== 'Recording' && r.status !== 'Uploading...'), [recordings]);

  return (
    <div className="flex h-screen w-full bg-[var(--color-bg-base)] text-[var(--color-text-primary)] font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-[260px] border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-6 flex flex-col shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full"></div>
          </div>
          <h1 className="text-lg font-bold tracking-tight">StreamRecorder</h1>
        </div>

        <nav className="space-y-6">
          <div className="space-y-2 flex flex-col">
            <p className="metric-label px-2">Navigation</p>
            <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-3 px-2 py-1.5 rounded-md font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-zinc-800/50 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <span className="w-2 h-2 rounded-full bg-red-500"></span> Dashboard
            </button>
            <button onClick={() => setActiveTab('media')} className={`flex items-center gap-3 px-2 py-1.5 rounded-md font-medium transition-colors ${activeTab === 'media' ? 'bg-zinc-800/50 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Video className="w-4 h-4" /> Media
            </button>
            <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-3 px-2 py-1.5 rounded-md font-medium transition-colors ${activeTab === 'settings' ? 'bg-zinc-800/50 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Settings className="w-4 h-4" /> Settings
            </button>
          </div>

          <div className="space-y-2">
            <p className="metric-label px-2">Stats</p>
            <div className="px-2 py-1 flex items-center justify-between text-sm text-zinc-500">
              <span>Monitored</span>
              <span className="text-white font-mono">{status?.counts?.monitored ?? 0}</span>
            </div>
            <div className="px-2 py-1 flex items-center justify-between text-sm text-zinc-500">
              <span>Recordings</span>
              <span className="text-white font-mono">{status?.counts?.recordings ?? 0}</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Error Banner */}
        {apiError && (
          <div className="bg-red-900/50 border-b border-red-500/50 text-red-200 px-6 py-3 text-sm flex justify-between items-center shrink-0">
             <span>{apiError}</span>
             <button onClick={() => setApiError(null)} className="hover:text-white" aria-label="Dismiss error">&times;</button>
          </div>
        )}

        {/* Header */}
        <header className="h-[64px] border-b border-[var(--color-border-subtle)] bg-zinc-950/50 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-8">
            <div>
              <p className="metric-label">Global Status</p>
              <p className="text-emerald-500 text-sm font-medium">Operational</p>
            </div>
            <div className="h-8 w-[1px] bg-zinc-800"></div>
            <div>
              <p className="metric-label">Active Tasks</p>
              <p className="text-white text-sm font-medium flex items-center gap-2">
                {(status?.counts?.live ?? 0) > 0 ? (
                  <>
                     <span className="w-2 h-2 rounded-full bg-red-500 status-recording"></span>
                     {status?.counts?.live ?? 0} LIVE
                  </>
                ) : (
                  "0 LIVE"
                )}
              </p>
            </div>
          </div>
          <button aria-label="Refresh Data" onClick={fetchData} className="text-zinc-400 hover:text-white transition-colors">
             <RefreshCw className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            
            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <form onSubmit={handleSaveSettings} className="glass rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Bell className="w-5 h-5 text-zinc-400" />
                    <h2 className="text-sm font-medium text-white">Discord Webhook</h2>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="url"
                      className="flex-1 bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-600"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={settings.webhook_url || ''}
                      onChange={e => setSettings({...settings, webhook_url: e.target.value})}
                    />
                    <button type="submit" className="btn-primary">Save</button>
                  </div>
                </form>

                <form onSubmit={handleSaveSettings} className="glass rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <HardDrive className="w-5 h-5 text-zinc-400" />
                    <h2 className="text-sm font-medium text-white">Download Location</h2>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      className="flex-1 bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-600"
                      placeholder="/recordings or /data/exports"
                      value={settings.download_dir || ''}
                      onChange={e => setSettings({...settings, download_dir: e.target.value})}
                    />
                    <button type="submit" className="btn-primary">Save</button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'media' && (
              <div className="glass rounded-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-4">
                  <h2 className="text-sm font-medium text-white flex items-center gap-2">
                    <Video className="w-4 h-4 text-zinc-400" /> Media Library
                  </h2>
                  <button onClick={handleDeleteAllRecordings} className="text-[10px] px-3 py-1.5 bg-red-900/40 text-red-300 hover:bg-red-900/70 rounded transition-colors font-semibold tracking-wide uppercase">
                    Delete All Recordings
                  </button>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pastRecordings.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-zinc-500 italic">No media saved yet.</div>
                  ) : pastRecordings.map(r => {
                    const filename = r.file_name || (r.file_path ? r.file_path.split(/[\/\\]/).pop() : '');
                    const videoSource = r.media_url || r.direct_url;
                    const canIframePreview = !videoSource && r.file_url?.includes('gofile.io/d/');
                    return (
                    <div key={r.id} className="bg-zinc-900/50 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] p-5">
                      <div className="font-medium text-[var(--color-text-primary)] truncate mb-1" title={r.streamer_name}>{r.streamer_name}</div>
                      <div className="text-xs text-zinc-500 font-mono mb-4">
                        {r.finished_at ? format(new Date(r.finished_at), 'MMM dd - HH:mm:ss') : ''} • {r.status}{r.stop_reason === 'manual' ? ' (manual stop)' : ''}
                      </div>

                      {r.file_url ? (
                        <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded p-3 text-sm">
                           <p className="text-zinc-500 text-[10px] mb-1 uppercase tracking-wider font-semibold">Uploaded Link</p>
                           <a href={r.file_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors font-mono tracking-tight break-all text-xs block">{r.file_url}</a>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-black/40 border border-[var(--color-border-subtle)] rounded p-3">
                           <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[50%]" title={filename}>{filename || 'Unknown File'}</span>
                           <button className="text-[10px] px-3 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white rounded transition-colors font-semibold tracking-wide uppercase disabled:opacity-50"
                             onClick={(e) => handleUpload(r.id, e)}
                             disabled={r.status === 'Uploading...'}
                           >
                              {r.status === 'Uploading...' ? 'Uploading...' : 'Upload to GoFile'}
                           </button>
                        </div>
                      )}

                      {videoSource && (
                        <div className="mt-4">
                          <p className="text-zinc-500 text-[10px] mb-2 uppercase tracking-wider font-semibold">Preview</p>
                          <div className="relative rounded-md overflow-hidden border border-[var(--color-border-subtle)] bg-black/60 min-h-[140px]">
                            {loadingMedia[r.id] && (
                              <div className="absolute inset-0 animate-pulse bg-zinc-800/60" />
                            )}
                              <video
                                className="w-full h-[180px] object-cover"
                                controls
                                preload="metadata"
                                playsInline
                                src={videoSource}
                                onError={() => handleResolveDirectUrl(r.id)}
                              />
                            </div>
                          </div>
                      )}
                      {canIframePreview && (
                        <iframe
                          className="mt-4 w-full h-[220px] rounded border border-[var(--color-border-subtle)] bg-black"
                          src={r.file_url}
                          title={`GoFile preview ${r.streamer_name}`}
                          loading="lazy"
                        />
                      )}
                      <button onClick={() => handleDeleteRecording(r.id)} className="mt-4 w-full text-[10px] px-3 py-1.5 bg-red-950/40 text-red-300 hover:bg-red-950/60 rounded transition-colors font-semibold tracking-wide uppercase">
                        Delete Recording
                      </button>
                    </div>
                  )})}
                </div>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                
                {/* Streamers Column */}
                <div className="space-y-6">
                  <div className="glass rounded-xl p-6">
                    <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-zinc-400" /> Add Streamer
                    </h2>
                    <form onSubmit={handleAddStreamer} className="grid grid-cols-1 md:grid-cols-[1fr,2fr,auto,auto] gap-3">
                      <input required placeholder="Name (opt)" className="bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:border-zinc-500 outline-none placeholder:text-zinc-600" value={newStreamer.name} onChange={e => setNewStreamer({...newStreamer, name: e.target.value})} />
                      <input required placeholder="URL or Handle" className="bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:border-zinc-500 outline-none placeholder:text-zinc-600" value={newStreamer.url} onChange={e => setNewStreamer({...newStreamer, url: e.target.value})} />
                      <input type="number" placeholder="Int (s)" className="bg-black/50 border border-[var(--color-border-subtle)] rounded-md px-3 py-2 text-sm focus:border-zinc-500 outline-none w-20 placeholder:text-zinc-600" value={newStreamer.check_interval_seconds || ''} onChange={e => setNewStreamer({...newStreamer, check_interval_seconds: parseInt(e.target.value) || 0})} />
                      <button type="submit" className="btn-primary whitespace-nowrap px-4 py-2">
                        Add Target
                      </button>
                    </form>
                  </div>

                  <div className="glass rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <h2 className="text-sm font-medium text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-zinc-400" /> Monitored Streamers
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="metric-label bg-black/40 border-b border-[var(--color-border-subtle)]">
                          <tr>
                            <th className="px-5 py-3 font-medium">Target</th>
                            <th className="px-5 py-3 font-medium">Status</th>
                            <th className="px-5 py-3 font-medium">Last Seen</th>
                            <th className="px-5 py-3 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)] bg-transparent">
                          {streamers.length === 0 ? (
                            <tr><td colSpan={4} className="px-5 py-6 text-center text-zinc-600 italic">No streamers configured yet.</td></tr>
                          ) : streamers.map(s => (
                            <tr key={s.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-5 py-3">
                                <div className="font-medium text-[var(--color-text-primary)]">{s.name || s.url}</div>
                                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono tracking-tight">{s.url}</a>
                              </td>
                              <td className="px-5 py-3">
                                {s.state === 'live' ? (
                                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-red-500">
                                     <span className="w-1.5 h-1.5 rounded-full bg-red-500 status-recording"></span> LIVE
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
                                    {s.state}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-zinc-500 font-mono text-[11px]">
                                {s.last_seen_live_at ? formatDistanceToNow(new Date(s.last_seen_live_at), {addSuffix: true}) : '-'}
                              </td>
                              <td className="px-5 py-3 flex items-center justify-end gap-3">
                                <button aria-label="Start recording" onClick={() => handleStartStreamer(s.id)} className="text-zinc-500 hover:text-white transition-colors" title="Force check/start">
                                  <Play className="w-4 h-4 fill-current" />
                                </button>
                                <button
                                  aria-label="Stop auto checks"
                                  onClick={() => handleStopStreamer(s.id)}
                                  className="text-zinc-500 hover:text-red-400 transition-colors"
                                  title="Stop / cooldown"
                                  disabled={busyStreamerId === s.id}
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                                <button aria-label="Delete streamer" onClick={() => handleDeleteStreamer(s.id)} className="text-zinc-500 hover:text-red-400 transition-colors" title="Delete">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Recordings Column */}
                <div className="space-y-6">
                  <div className="glass rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <h2 className="text-sm font-medium text-white flex items-center gap-2">
                        <RotateCw className={`w-4 h-4 ${activeRecordings.length > 0 ? 'text-red-500' : 'text-zinc-400'}`} /> 
                        Active Recordings
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="metric-label bg-black/40 border-b border-[var(--color-border-subtle)]">
                          <tr>
                            <th className="px-5 py-3 font-medium">Streamer</th>
                            <th className="px-5 py-3 font-medium">Started</th>
                            <th className="px-5 py-3 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)] bg-transparent">
                          {activeRecordings.length === 0 ? (
                            <tr><td colSpan={3} className="px-5 py-6 text-center text-zinc-600 italic">No active recordings right now.</td></tr>
                          ) : activeRecordings.map(r => (
                            <tr key={r.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">{r.streamer_name}</td>
                              <td className="px-5 py-3 text-zinc-500 font-mono text-[11px]">{format(new Date(r.started_at), 'HH:mm:ss')}</td>
                              <td className="px-5 py-3 flex justify-end">
                                 <button aria-label="Stop recording" onClick={() => handleStopRecording(r.id)} className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded border border-red-500/20 md:border-transparent md:hover:border-red-500/30 transition-all text-[10px] uppercase tracking-wider font-semibold">
                                  <Square className="w-3 h-3 fill-current" /> Stop
                                 </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="glass rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-[var(--color-border-subtle)]">
                      <h2 className="text-sm font-medium text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-zinc-400" /> Recorded Videos
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="metric-label bg-black/40 border-b border-[var(--color-border-subtle)]">
                          <tr>
                            <th className="px-5 py-3 font-medium">Streamer</th>
                            <th className="px-5 py-3 font-medium">Finished</th>
                             <th className="px-5 py-3 font-medium">Link / Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-subtle)] bg-transparent">
                           {pastRecordings.length === 0 ? (
                            <tr><td colSpan={3} className="px-5 py-6 text-center text-zinc-600 italic">No recording history yet.</td></tr>
                          ) : pastRecordings.map((r: any) => (
                            <tr key={r.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">
                                  {r.streamer_name}
                                  <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">{r.status}</div>
                              </td>
                              <td className="px-5 py-3 text-zinc-500 font-mono text-[11px]">
                                {r.finished_at ? format(new Date(r.finished_at), 'MM/dd HH:mm') : '-'}
                              </td>
                              <td className="px-5 py-3">
                                 {r.file_url ? (
                                   <a href={r.file_url} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-blue-400 hover:text-blue-300 truncate max-w-[200px] block transition-colors">
                                     {r.file_url}
                                   </a>
                                 ) : (
                                   <div className="flex flex-col items-start">
                                     <div className="max-w-[200px] truncate text-[10px] font-mono text-zinc-600 tracking-tight mb-1" title={r.file_name || ''}>{r.file_name || '-'}</div>
                                     <button onClick={(e) => handleUpload(r.id, e)} disabled={r.status === 'Uploading...'} className="text-[10px] uppercase font-semibold text-zinc-400 hover:text-white transition-colors disabled:opacity-50">
                                       {r.status === 'Uploading...' ? 'Uploading...' : 'Upload link'}
                                     </button>
                                   </div>
                                 )}
                              </td>
                            </tr>
                          ))}
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
             <span className="metric-label">Storage Path:</span>
             <span className="font-mono text-zinc-400">{settings.download_dir || 'data/recordings'}</span>
           </div>
           <div className="flex items-center gap-4 metric-label">
             <span className="flex items-center gap-1.5 text-zinc-400">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
               System: Operational
             </span>
           </div>
        </footer>

      </main>
    </div>
  );
}

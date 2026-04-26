import { Activity, Play, Plus, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Recording, RecorderStatus, Streamer } from '../types';
import { formatDateTime, formatRelative } from '../utils/formatters';

interface Props {
  streamers: Streamer[];
  activeRecordings: Recording[];
  recorder?: RecorderStatus;
  onRefresh: () => Promise<void>;
}

export function DashboardSection({ streamers, activeRecordings, recorder, onRefresh }: Props) {
  const [busyStreamerId, setBusyStreamerId] = useState<string | null>(null);
  const [newStreamer, setNewStreamer] = useState({ name: '', url: '', check_interval_seconds: 300 });
  const usesStreamlink = (url: string) => /twitch\.tv|youtube\.com|youtu\.be|tiktok\.com/i.test(url);
  const canStartStreamer = (url: string) => {
    if (!recorder) return true;
    if (usesStreamlink(url)) return recorder.dependencies.streamlink.ready;
    return recorder.dependencies.yt_dlp.ready && recorder.dependencies.ffmpeg.ready;
  };
  const startBlockReason = (url: string) => {
    if (!recorder) return 'Start recording';
    if (usesStreamlink(url)) {
      return recorder.dependencies.streamlink.ready ? 'Start recording' : 'Missing dependency: streamlink';
    }
    const missing = [
      !recorder.dependencies.yt_dlp.ready ? 'yt_dlp' : null,
      !recorder.dependencies.ffmpeg.ready ? 'ffmpeg' : null
    ].filter(Boolean).join(', ');
    return missing ? `Missing dependencies: ${missing}` : 'Start recording';
  };

  const withRefresh = async (job: () => Promise<unknown>) => {
    await job();
    await onRefresh();
  };

  return (
    <section className="stack-lg">
      <article className="card">
        <h2 className="section-title"><Plus size={16} /> Add Streamer</h2>
        <form
          className="grid-form"
          onSubmit={(event) => {
            event.preventDefault();
            void withRefresh(() => api.post('/api/streamers', newStreamer));
            setNewStreamer({ name: '', url: '', check_interval_seconds: 300 });
          }}
        >
          <input required placeholder="Display name" value={newStreamer.name} onChange={(e) => setNewStreamer({ ...newStreamer, name: e.target.value })} />
          <input required placeholder="URL or handle" value={newStreamer.url} onChange={(e) => setNewStreamer({ ...newStreamer, url: e.target.value })} />
          <input type="number" min={30} step={30} value={newStreamer.check_interval_seconds} onChange={(e) => setNewStreamer({ ...newStreamer, check_interval_seconds: Number(e.target.value) || 300 })} />
          <button className="btn btn-primary" type="submit">Add</button>
        </form>
      </article>

      <article className="card">
        <h2 className="section-title"><Activity size={16} /> Monitored Streamers</h2>
        {recorder && !recorder.ready && (
          <div className="inline-warning" role="alert">
            Some recorder dependencies are unavailable. Missing: {recorder.missing.join(', ')}.
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Streamer</th><th>Status</th><th>Last live</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {streamers.length === 0 && <tr><td colSpan={4} className="empty">No streamers configured yet.</td></tr>}
              {streamers.map((streamer) => (
                <tr key={streamer.id}>
                  <td>
                    <p>{streamer.name || 'Unnamed streamer'}</p>
                    <a href={streamer.url} target="_blank" rel="noreferrer">{streamer.url}</a>
                  </td>
                  <td><span className={`pill pill-${streamer.state}`}>{streamer.state}</span></td>
                  <td>{formatRelative(streamer.last_seen_live_at)}</td>
                  <td className="actions-cell">
                    <button
                      aria-label="Start streamer"
                      onClick={() => void withRefresh(async () => {
                        setBusyStreamerId(streamer.id);
                        try {
                          await api.post(`/api/streamers/${streamer.id}/start`);
                        } finally {
                          setBusyStreamerId(null);
                        }
                      })}
                      disabled={busyStreamerId === streamer.id || !canStartStreamer(streamer.url)}
                      title={startBlockReason(streamer.url)}
                    >
                      <Play size={14} />
                    </button>
                    <button aria-label="Stop streamer" disabled={busyStreamerId === streamer.id} onClick={() => void withRefresh(async () => {
                      setBusyStreamerId(streamer.id);
                      try {
                        await api.post(`/api/streamers/${streamer.id}/stop`);
                      } finally {
                        setBusyStreamerId(null);
                      }
                    })}><Square size={14} /></button>
                    <button aria-label="Delete streamer" onClick={() => void withRefresh(() => api.delete(`/api/streamers/${streamer.id}`))}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2 className="section-title"><Square size={16} /> Active Recordings</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Streamer</th><th>Started</th><th>Action</th></tr>
            </thead>
            <tbody>
              {activeRecordings.length === 0 && <tr><td colSpan={3} className="empty">No active recordings.</td></tr>}
              {activeRecordings.map((recording) => (
                <tr key={recording.id}>
                  <td>{recording.streamer_name}</td>
                  <td>{formatDateTime(recording.started_at, 'HH:mm:ss')}</td>
                  <td>
                    <button className="btn btn-danger" onClick={() => void withRefresh(() => api.post(`/api/recordings/${recording.id}/stop`))}>Stop</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

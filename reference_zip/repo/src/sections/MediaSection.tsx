import { Trash2, Upload, Video } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Recording } from '../types';
import { formatDateTime } from '../utils/formatters';

interface Props {
  recordings: Recording[];
  onRefresh: () => Promise<void>;
}

export function MediaSection({ recordings, onRefresh }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const uploadRecording = async (id: string) => {
    setLoadingId(id);
    try {
      await api.post(`/api/recordings/${id}/upload`);
      await onRefresh();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <section className="stack-lg">
      <article className="card">
        <div className="space-between">
          <h2 className="section-title"><Video size={16} /> Media Library</h2>
          <button className="btn btn-danger" onClick={() => void api.delete('/api/recordings').then(onRefresh)}>Delete all</button>
        </div>
      </article>

      <div className="media-grid">
        {recordings.length === 0 && <p className="empty">No media saved yet.</p>}
        {recordings.map((recording) => {
          const videoSource = recording.playback_url || recording.media_url || recording.direct_url;
          return (
            <article className="media-card" key={recording.id}>
              <div className="space-between">
                <div>
                  <h3>{recording.streamer_name}</h3>
                  <p>{formatDateTime(recording.finished_at)} · {recording.status}</p>
                </div>
                <button aria-label="Delete recording" onClick={() => void api.delete(`/api/recordings/${recording.id}`).then(onRefresh)}><Trash2 size={14} /></button>
              </div>

              {videoSource && (
                <video controls preload="metadata" src={videoSource} className="video-preview">
                  Your browser could not load this video.
                </video>
              )}

              {recording.file_url ? (
                <a href={recording.file_url} target="_blank" rel="noreferrer" className="recording-link">Open upload</a>
              ) : (
                <button
                  className="btn"
                  disabled={loadingId === recording.id || recording.status === 'Uploading...'}
                  onClick={() => void uploadRecording(recording.id)}
                >
                  <Upload size={14} /> {loadingId === recording.id ? 'Uploading...' : 'Upload to GoFile'}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

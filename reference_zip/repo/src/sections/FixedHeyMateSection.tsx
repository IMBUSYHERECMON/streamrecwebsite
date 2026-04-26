import { Archive, ExternalLink, Film, Loader2, Plus, Search, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { FixedHeyMateVideo } from '../types';

type VaultView = 'library' | 'archive';

export function FixedHeyMateSection() {
  const [videos, setVideos] = useState<FixedHeyMateVideo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<VaultView>('library');
  const [query, setQuery] = useState('');
  const [archiveUrl, setArchiveUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const loadVideos = async () => {
    try {
      const data = await api.get<FixedHeyMateVideo[]>('/api/archiver/videos');
      setVideos(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load archive library.');
    }
  };

  useEffect(() => {
    void loadVideos();
    const timer = window.setInterval(() => void loadVideos(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return videos;
    return videos.filter((video) =>
      [video.title, video.channel, video.youtube_id].some((value) => value?.toLowerCase().includes(term))
    );
  }, [query, videos]);

  const selectedVideo = videos.find((video) => video.id === selectedId) ?? filtered[0] ?? null;
  const selectedPlaybackUrl = selectedVideo ? `/api/archiver/videos/${selectedVideo.id}/play` : '';

  useEffect(() => {
    setPlayerError(null);
  }, [selectedVideo?.id]);

  useEffect(() => {
    if (!selectedVideo && filtered[0]) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedVideo]);

  const archiveVideo = async () => {
    if (!archiveUrl.trim()) return;
    setIsSubmitting(true);
    try {
      await api.post<FixedHeyMateVideo>('/api/archiver/archive', { url: archiveUrl.trim() });
      setArchiveUrl('');
      setView('library');
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive video.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="stack-lg">
      <article className="card vault-shell">
        <div className="vault-topbar">
          <div>
            <p className="eyebrow">Archiver Vault</p>
            <h2 className="tool-headline">Archive Library</h2>
            <p className="tool-copy">Separate archive system with its own library, player, and ingest flow.</p>
          </div>
          <div className="vault-toggle">
            <button className={`btn ${view === 'library' ? 'btn-primary' : ''}`} onClick={() => setView('library')}>
              <Video size={14} /> Library
            </button>
            <button className={`btn ${view === 'archive' ? 'btn-primary' : ''}`} onClick={() => setView('archive')}>
              <Plus size={14} /> Archive New
            </button>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {view === 'archive' ? (
          <div className="vault-compose">
            <article className="card vault-compose-card">
              <h3 className="section-title"><Archive size={16} /> Archive a New Video</h3>
              <p className="tool-copy">Paste a YouTube or other supported video URL. This tab stores archived videos separately from stream recordings.</p>
              <input
                type="url"
                value={archiveUrl}
                placeholder="https://www.youtube.com/watch?v=..."
                onChange={(event) => setArchiveUrl(event.target.value)}
              />
              <button className="btn btn-primary" onClick={() => void archiveVideo()} disabled={isSubmitting || !archiveUrl.trim()}>
                {isSubmitting ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Archive to Archiver
              </button>
            </article>
          </div>
        ) : (
          <div className="vault-layout">
            <aside className="vault-browser card">
              <div className="vault-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search archived videos"
                />
              </div>
              <div className="vault-list">
                {filtered.map((video) => (
                  <button
                    key={video.id}
                    className={`vault-list-item ${selectedVideo?.id === video.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(video.id)}
                  >
                    <strong>{video.title}</strong>
                    <span>{video.channel}</span>
                    <small>{video.status === 'ready' ? 'Ready' : video.status}</small>
                  </button>
                ))}
                {filtered.length === 0 && <p className="empty">No archived videos found.</p>}
              </div>
            </aside>

            <div className="vault-viewer">
              {selectedVideo ? (
                <>
                  <article className="card vault-player-card">
                    <video
                      key={selectedVideo.id}
                      controls
                      preload="metadata"
                      src={selectedPlaybackUrl}
                      className="video-preview vault-player"
                      onError={() => {
                        const fallback =
                          selectedVideo.storage_type === 'remote'
                            ? 'This remote link appears expired or unavailable. Re-archive this video with a fresh source URL.'
                            : 'Local file missing. Re-archive has been requested if source URL exists.';
                        setPlayerError(selectedVideo.error_message || fallback);
                      }}
                    />
                    {playerError && <div className="inline-warning">{playerError}</div>}
                  </article>
                  <article className="card stack-md">
                    <div className="space-between">
                      <div>
                        <h3 className="vault-video-title">{selectedVideo.title}</h3>
                        <p className="tool-copy">{selectedVideo.channel} · {selectedVideo.storage_type === 'remote' ? 'Seeded archive' : 'Locally archived'}</p>
                      </div>
                      {selectedVideo.source_url && (
                        <a className="btn" href={selectedVideo.source_url} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} /> Source
                        </a>
                      )}
                    </div>
                    <div className="vault-meta-grid">
                      <div><span>Uploaded</span><strong>{selectedVideo.upload_date || 'Unknown'}</strong></div>
                      <div><span>Status</span><strong>{selectedVideo.status}</strong></div>
                      <div><span>Stored As</span><strong>{selectedVideo.storage_type}</strong></div>
                    </div>
                    {selectedVideo.description && <p className="tool-copy">{selectedVideo.description}</p>}
                  </article>
                </>
              ) : (
                <article className="card empty-state-card">
                  <Film size={22} />
                  <p className="empty">Select an archived video to start watching.</p>
                </article>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

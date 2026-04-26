import { Download, Loader2, Terminal, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { TikTokDownloadJob } from '../types';

export function TikTokDownloaderSection() {
  const [username, setUsername] = useState('');
  const [jobs, setJobs] = useState<TikTokDownloadJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadJobs = async () => {
    try {
      const data = await api.get<TikTokDownloadJob[]>('/api/tiktok-downloader/jobs');
      setJobs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load TikTok jobs.');
    }
  };

  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const deleteJob = async (id: string) => {
    try {
      await api.delete(`/api/tiktok-downloader/jobs/${id}`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job.');
    }
  };

  const startJob = async () => {
    const clean = username.replace(/^@/, '').trim();
    if (!clean) return;
    setIsSubmitting(true);
    try {
      await api.post<TikTokDownloadJob>('/api/tiktok-downloader/jobs', { username: clean });
      setUsername('');
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start TikTok download.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="stack-lg">
      <article className="card tool-hero tool-downloader stack-md">
        <div className="space-between">
          <div>
            <p className="eyebrow">TikTok Downloader</p>
            <h2 className="tool-headline">Profile Downloader</h2>
            <p className="tool-copy">Run the Python downloader directly from the site by entering a TikTok username.</p>
          </div>
          <span className="tool-badge">Live Tool</span>
        </div>
        <div className="downloader-form">
          <div className="vault-search">
            <UserRound size={15} />
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@username"
            />
          </div>
          <button className="btn btn-primary" disabled={isSubmitting || !username.trim()} onClick={() => void startJob()}>
            {isSubmitting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Run Downloader
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </article>

      <div className="stack-lg">
        {jobs.length === 0 && <article className="card"><p className="empty">No TikTok download jobs yet.</p></article>}
        {jobs.map((job) => (
          <article key={job.id} className="card stack-md">
            <div className="space-between">
              <div>
                <h3 className="vault-video-title">@{job.username}</h3>
                <p className="tool-copy">{job.status} · {new Date(job.updated_at).toLocaleString()}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {job.zip_url && (
                  <a className="btn" href={job.zip_url}>
                    <Download size={14} /> Download Zip
                  </a>
                )}
                <button className="btn btn-danger" onClick={() => void deleteJob(job.id)} title="Delete job and zip">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>

            <div className="vault-meta-grid">
              <div><span>Status</span><strong>{job.status}</strong></div>
              <div><span>Output Dir</span><strong>{job.output_dir}</strong></div>
              <div><span>Zip</span><strong>{job.zip_path ?? 'Pending'}</strong></div>
            </div>

            <div className="card code-panel-shell">
              <h4 className="section-title"><Terminal size={15} /> Job Log</h4>
              <pre className="code-panel">
                <code>{job.logs.join('\n') || 'No log output yet.'}</code>
              </pre>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

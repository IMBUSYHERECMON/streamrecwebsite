import { Bell, HardDrive, Save } from 'lucide-react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import type { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  onRefresh: () => Promise<void>;
}

export function SettingsSection({ settings, setSettings, onRefresh }: Props) {
  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    await api.post('/api/settings', settings);
    await onRefresh();
  };

  return (
    <section className="stack-lg">
      <form className="card stack-md" onSubmit={saveSettings}>
        <h2 className="section-title"><Bell size={16} /> Notifications</h2>
        <label>
          Discord webhook URL
          <input
            type="url"
            value={settings.webhook_url}
            placeholder="https://discord.com/api/webhooks/..."
            onChange={(event) => setSettings({ ...settings, webhook_url: event.target.value })}
          />
        </label>
        <label>
          Download folder
          <input
            value={settings.download_dir}
            onChange={(event) => setSettings({ ...settings, download_dir: event.target.value })}
          />
        </label>
        <button className="btn btn-primary" type="submit"><Save size={14} /> Save settings</button>
      </form>

      <article className="card">
        <h2 className="section-title"><HardDrive size={16} /> System notes</h2>
        <ul>
          <li>Uploads are processed asynchronously to keep the UI responsive.</li>
          <li>Manual stop operations trigger cooldown protection on the backend.</li>
          <li>The dashboard polls every 5 seconds for near-real-time visibility.</li>
        </ul>
      </article>
    </section>
  );
}

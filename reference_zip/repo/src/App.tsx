import { lazy, Suspense, useMemo, useState } from 'react';
import { Box, Download, LayoutDashboard, RefreshCw, Settings, Video } from 'lucide-react';
import { useDashboardData } from './hooks/useDashboardData';
import type { AppTab } from './types';

const DashboardSection = lazy(() => import('./sections/DashboardSection').then((module) => ({ default: module.DashboardSection })));
const MediaSection = lazy(() => import('./sections/MediaSection').then((module) => ({ default: module.MediaSection })));
const SettingsSection = lazy(() => import('./sections/SettingsSection').then((module) => ({ default: module.SettingsSection })));
const FixedHeyMateSection = lazy(() => import('./sections/FixedHeyMateSection').then((module) => ({ default: module.FixedHeyMateSection })));
const TikTokDownloaderSection = lazy(() => import('./sections/TikTokDownloaderSection').then((module) => ({ default: module.TikTokDownloaderSection })));

const TAB_GROUPS: Array<{
  heading: string;
  items: Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard; description: string; indent?: boolean }>;
}> = [
  {
    heading: 'Stream Recorder',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Operational monitoring and recording controls.' },
      { id: 'media', label: 'Recordings', icon: Video, description: 'Playback, uploads, and saved capture management.' },
      { id: 'settings', label: 'Settings', icon: Settings, description: 'System configuration and notification settings.' }
    ]
  },
  {
    heading: 'Imported Tools',
    items: [
      { id: 'archiver', label: 'Archiver', icon: Box, description: 'Isolated archive module with its own library and ingest flow.', indent: true },
      { id: 'tiktok-downloader', label: 'TikTok Downloader', icon: Download, description: 'Standalone Python workflow for profile video downloads.', indent: true }
    ]
  }
];

const TAB_META = Object.fromEntries(
  TAB_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item]))
) as Record<AppTab, { id: AppTab; label: string; icon: typeof LayoutDashboard; description: string; indent?: boolean }>;

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const {
    streamers,
    settings,
    status,
    apiError,
    isRefreshing,
    activeRecordings,
    pastRecordings,
    setSettings,
    refreshData
  } = useDashboardData();

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'archiver':
        return <FixedHeyMateSection />;
      case 'tiktok-downloader':
        return <TikTokDownloaderSection />;
      case 'media':
        return <MediaSection recordings={pastRecordings} onRefresh={refreshData} />;
      case 'settings':
        return <SettingsSection settings={settings} setSettings={setSettings} onRefresh={refreshData} />;
      case 'dashboard':
      default:
        return <DashboardSection streamers={streamers} activeRecordings={activeRecordings} recorder={status.recorder} onRefresh={refreshData} />;
    }
  }, [activeTab, activeRecordings, pastRecordings, refreshData, settings, setSettings, status.recorder, streamers]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <h1>Stream Recorder</h1>
        <nav className="nav-groups">
          {TAB_GROUPS.map((group) => (
            <div key={group.heading} className="nav-group">
              <p className="nav-group-title">{group.heading}</p>
              {group.items.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={`${activeTab === tab.id ? 'active' : ''} ${tab.indent ? 'subnav-item' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={16} /> {tab.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <dl className="stats">
          <div><dt>Live</dt><dd>{status.counts.live}</dd></div>
          <div><dt>Monitored</dt><dd>{status.counts.monitored}</dd></div>
          <div><dt>Recordings</dt><dd>{status.counts.recordings}</dd></div>
        </dl>
      </aside>

      <main className="content">
        <header>
          <div>
            <h2>{TAB_META[activeTab].label}</h2>
            <p>{TAB_META[activeTab].description}</p>
          </div>
          <button className="btn" onClick={() => void refreshData()} aria-live="polite">
            <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} /> Refresh
          </button>
        </header>

        {apiError && (
          <div className="error-banner" role="alert">
            {apiError}
          </div>
        )}

        <Suspense fallback={<p className="card">Loading section…</p>}>
          {tabContent}
        </Suspense>
      </main>
    </div>
  );
}

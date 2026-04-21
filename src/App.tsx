import { lazy, Suspense, useMemo, useState } from 'react';
import { LayoutDashboard, RefreshCw, Settings, Video } from 'lucide-react';
import { useDashboardData } from './hooks/useDashboardData';
import type { AppTab } from './types';

const DashboardSection = lazy(() => import('./sections/DashboardSection').then((module) => ({ default: module.DashboardSection })));
const MediaSection = lazy(() => import('./sections/MediaSection').then((module) => ({ default: module.MediaSection })));
const SettingsSection = lazy(() => import('./sections/SettingsSection').then((module) => ({ default: module.SettingsSection })));

const TABS: Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'media', label: 'Media', icon: Video },
  { id: 'settings', label: 'Settings', icon: Settings }
];

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
      case 'media':
        return <MediaSection recordings={pastRecordings} onRefresh={refreshData} />;
      case 'settings':
        return <SettingsSection settings={settings} setSettings={setSettings} onRefresh={refreshData} />;
      case 'dashboard':
      default:
        return <DashboardSection streamers={streamers} activeRecordings={activeRecordings} onRefresh={refreshData} />;
    }
  }, [activeTab, activeRecordings, pastRecordings, refreshData, settings, setSettings, streamers]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <h1>Stream Recorder</h1>
        <nav>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
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
            <h2>{TABS.find((tab) => tab.id === activeTab)?.label}</h2>
            <p>Operational monitoring and recording controls.</p>
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

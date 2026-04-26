import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { ApiStatus, AppSettings, Recording, Streamer } from '../types';

const EMPTY_STATUS: ApiStatus = { counts: { live: 0, monitored: 0, recordings: 0 } };
const EMPTY_SETTINGS: AppSettings = { webhook_url: '', download_dir: 'data/recordings' };

export function useDashboardData() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [status, setStatus] = useState<ApiStatus>(EMPTY_STATUS);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [streamerData, recordingData, settingsData, statusData] = await Promise.all([
        api.get<Streamer[]>('/api/streamers'),
        api.get<Recording[]>('/api/recordings'),
        api.get<AppSettings>('/api/settings'),
        api.get<ApiStatus>('/api/status')
      ]);

      setStreamers(streamerData);
      setRecordings(recordingData);
      setSettings(settingsData);
      setStatus(statusData);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to load data.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
    const pollTimer = window.setInterval(() => void refreshData(), 5000);
    return () => window.clearInterval(pollTimer);
  }, [refreshData]);

  const activeRecordings = useMemo(
    () => recordings.filter((recording) => recording.status === 'Recording'),
    [recordings]
  );

  const pastRecordings = useMemo(
    () => recordings.filter((recording) => recording.status !== 'Recording'),
    [recordings]
  );

  return {
    streamers,
    recordings,
    settings,
    status,
    apiError,
    isRefreshing,
    activeRecordings,
    pastRecordings,
    setRecordings,
    setSettings,
    refreshData
  };
}

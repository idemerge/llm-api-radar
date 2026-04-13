import { useState, useCallback } from 'react';
import { apiFetch } from '../services/api';

export interface PingResult {
  id: number;
  providerId: string;
  providerName: string;
  modelName: string;
  status: 'ok' | 'error';
  healthStatus: 'healthy' | 'slow' | 'very_slow' | 'down';
  latencyMs: number;
  ttftMs: number;
  outputTokens: number;
  responseText?: string;
  errorMessage?: string;
  checkedAt: string;
}

export interface MonitorTarget {
  providerId: string;
  modelName: string;
  providerName: string;
  intervalMinutes?: number; // 0 = use global default
}

export interface HealthThresholds {
  tpsSlowThreshold: number;
  tpsVerySlowThreshold: number;
  ttftSlowMs: number;
  minOutputTokens: number;
}

export interface MonitorGlobalConfig {
  defaultIntervalMinutes: number; // 5–360
  healthThresholds: HealthThresholds;
}

export function useMonitor() {
  const [statuses, setStatuses] = useState<PingResult[]>([]);
  const [history, setHistory] = useState<PingResult[]>([]);
  const [targets, setTargets] = useState<MonitorTarget[]>([]);
  const [globalConfig, setGlobalConfig] = useState<MonitorGlobalConfig>({
    defaultIntervalMinutes: 10,
    healthThresholds: { tpsSlowThreshold: 20, tpsVerySlowThreshold: 5, ttftSlowMs: 1000, minOutputTokens: 1 },
  });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/monitor/status');
      const data = await res.json();
      setStatuses(data);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchHistory = useCallback(async (hours = 24) => {
    try {
      const res = await apiFetch(`/api/monitor/history?hours=${hours}`);
      const data = await res.json();
      setHistory(data);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTargets = useCallback(async () => {
    try {
      const res = await apiFetch('/api/monitor/targets');
      const data = await res.json();
      setTargets(data);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/monitor/config');
      const data = await res.json();
      setGlobalConfig(data);
    } catch {
      /* ignore */
    }
  }, []);

  const saveConfig = useCallback(async (config: MonitorGlobalConfig) => {
    try {
      await apiFetch('/api/monitor/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setGlobalConfig(config);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchHistory(24), fetchTargets(), fetchConfig()]);
    setLoading(false);
  }, [fetchStatus, fetchHistory, fetchTargets, fetchConfig]);

  const saveTargets = useCallback(async (newTargets: MonitorTarget[]) => {
    try {
      await apiFetch('/api/monitor/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTargets),
      });
      setTargets(newTargets);
    } catch {
      /* ignore */
    }
  }, []);

  const triggerRun = useCallback(async () => {
    setRunning(true);
    try {
      const res = await apiFetch('/api/monitor/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatuses(data.results || []);
      }
      await fetchHistory(24);
    } catch {
      /* ignore */
    } finally {
      setRunning(false);
    }
  }, [fetchHistory]);

  return {
    statuses,
    history,
    targets,
    globalConfig,
    loading,
    running,
    fetchStatus,
    fetchHistory,
    fetchTargets,
    fetchConfig,
    saveConfig,
    fetchAll,
    saveTargets,
    triggerRun,
  };
}

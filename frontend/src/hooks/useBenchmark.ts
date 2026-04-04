import { useState, useCallback } from 'react';
import { BenchmarkConfig, BenchmarkRun } from '../types';
import { apiFetch, sseUrl, downloadUrl } from '../services/api';

interface UseBenchmarkReturn {
  benchmarks: BenchmarkRun[];
  currentRun: BenchmarkRun | null;
  isRunning: boolean;
  error: string | null;
  startBenchmark: (
    providers: string[],
    config: BenchmarkConfig,
    apiKeys: Record<string, string>
  ) => Promise<void>;
  fetchBenchmarks: () => Promise<BenchmarkRun[]>;
  fetchBenchmark: (id: string) => Promise<void>;
  exportBenchmark: (id: string, format: 'json' | 'csv') => void;
  cancelBenchmark: (id: string) => Promise<boolean>;
  eventSourceRef: React.MutableRefObject<EventSource | null>;
}

export function useBenchmark(): UseBenchmarkReturn {
  const [benchmarks, setBenchmarks] = useState<BenchmarkRun[]>([]);
  const [currentRun, setCurrentRun] = useState<BenchmarkRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = { current: null as EventSource | null };

  const fetchBenchmarks = useCallback(async (): Promise<BenchmarkRun[]> => {
    try {
      const res = await apiFetch('/api/benchmarks');
      const data = await res.json();
      setBenchmarks(data);
      return data;
    } catch (err) {
      setError('Failed to fetch benchmarks');
      return [];
    }
  }, []);

  const fetchBenchmark = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/benchmarks/${id}`);
      const data = await res.json();
      setCurrentRun(data);
    } catch (err) {
      setError('Failed to fetch benchmark');
    }
  }, []);

  const startBenchmark = useCallback(
    async (
      providers: string[],
      config: BenchmarkConfig,
      apiKeys: Record<string, string>
    ) => {
      setIsRunning(true);
      setError(null);

      try {
        const res = await apiFetch('/api/benchmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providers, config, apiKeys }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to start benchmark');
        }

        const { id } = await res.json();

        // Connect to SSE for real-time updates
        const eventSource = new EventSource(sseUrl(`/api/benchmarks/${id}/stream`));
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          const parsed = JSON.parse(event.data);

          if (parsed.type === 'init' || parsed.type === 'progress') {
            // Refresh current run data
            fetchBenchmark(id);
          }

          if (parsed.type === 'done') {
            eventSource.close();
            eventSourceRef.current = null;
            setIsRunning(false);
            fetchBenchmark(id);
            fetchBenchmarks();
          }

          if (parsed.type === 'error') {
            console.error('Benchmark error:', parsed.data);
            if (parsed.data?.message?.includes('cancelled')) {
              setError('Benchmark cancelled');
            }
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          eventSourceRef.current = null;
          setIsRunning(false);
          fetchBenchmark(id);
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsRunning(false);
      }
    },
    [fetchBenchmark, fetchBenchmarks]
  );

  const exportBenchmark = useCallback((id: string, format: 'json' | 'csv') => {
    window.open(downloadUrl(`/api/benchmarks/${id}/export?format=${format}`), '_blank');
  }, []);

  const cancelBenchmark = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/benchmarks/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setIsRunning(false);
        fetchBenchmark(id);
        return true;
      }
      return false;
    } catch (err) {
      setError('Failed to cancel benchmark');
      return false;
    }
  }, [fetchBenchmark]);

  return {
    benchmarks,
    currentRun,
    isRunning,
    error,
    startBenchmark,
    fetchBenchmarks,
    fetchBenchmark,
    exportBenchmark,
    cancelBenchmark,
    eventSourceRef,
  };
}

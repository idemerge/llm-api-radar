import { useState, useCallback, useRef, useEffect } from 'react';
import { BenchmarkWorkflow, WorkflowTemplate } from '../types';
import { apiFetch, sseUrl, downloadUrl } from '../services/api';
import { maskProviderLabels } from '../utils/demo';

const maskWorkflow = (w: BenchmarkWorkflow): BenchmarkWorkflow => ({
  ...w,
  providerLabels: maskProviderLabels(w.providerLabels),
});

/** Per-task iteration progress aggregated across all providers */
export interface TaskIterationProgress {
  taskId: string;
  /** Sum of completed iterations across providers */
  completed: number;
  /** Sum of total iterations across providers */
  total: number;
}

export interface LiveMetric {
  avgRT: number;
  avgTPS: number;
  recentRT: number;
}

interface UseWorkflowReturn {
  workflows: BenchmarkWorkflow[];
  currentWorkflow: BenchmarkWorkflow | null;
  templates: WorkflowTemplate[];
  isRunning: boolean;
  error: string | null;
  /** Real-time iteration progress per task (keyed by taskId) */
  taskProgress: Record<string, TaskIterationProgress>;
  /** Real-time metrics per task from latest SSE iteration results */
  liveMetrics: Record<string, LiveMetric>;
  /** Current cooldown between tasks */
  cooldown: { taskId: string; remainingMs: number } | null;
  startWorkflow: (data: CreateWorkflowData) => Promise<void>;
  fetchWorkflows: () => Promise<void>;
  fetchWorkflow: (id: string) => Promise<void>;
  fetchTemplates: () => Promise<void>;
  cancelWorkflow: (id: string) => Promise<boolean>;
  exportWorkflow: (id: string, format: 'json' | 'csv') => void;
  deleteWorkflow: (id: string) => Promise<boolean>;
  duplicateWorkflow: (id: string) => Promise<string | null>;
  clearError: () => void;
  reconnectActiveWorkflow: () => Promise<boolean>;
  workflowsLoaded: boolean;
}

export interface CreateWorkflowData {
  name: string;
  description?: string;
  providers: string[];
  apiKeys: Record<string, string>;
  tasks: Array<{
    name: string;
    description?: string;
    config: {
      prompt: string;
      systemPrompt?: string;
      maxTokens: number;
      concurrency: number;
      iterations: number;
      streaming?: boolean;
      warmupRuns?: number;
      requestInterval?: number;
      maxQps?: number;
    };
    providers?: string[];
    tags?: Record<string, string>;
  }>;
  options?: {
    stopOnFailure?: boolean;
    cooldownBetweenTasks?: number;
  };
}

export function useWorkflow(): UseWorkflowReturn {
  const [workflows, setWorkflows] = useState<BenchmarkWorkflow[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<BenchmarkWorkflow | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false);
  const [taskProgress, setTaskProgress] = useState<Record<string, TaskIterationProgress>>({});
  const [liveMetrics, setLiveMetrics] = useState<Record<string, LiveMetric>>({});
  const [cooldown, setCooldown] = useState<{ taskId: string; remainingMs: number } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  // Track per-provider progress within each task to compute aggregated counts
  const providerProgressRef = useRef<Record<string, Record<string, { completed: number; total: number }>>>({});

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await apiFetch('/api/workflows');
      const data = (await res.json()) as BenchmarkWorkflow[];
      setWorkflows(data.map(maskWorkflow));
      setWorkflowsLoaded(true);
    } catch {
      setError('Failed to fetch workflows');
    }
  }, []);

  const fetchWorkflow = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/workflows/${id}`);
      const data = maskWorkflow((await res.json()) as BenchmarkWorkflow);
      if (activeRunIdRef.current === id) {
        setCurrentWorkflow(data);
      }
    } catch {
      setError('Failed to fetch workflow');
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await apiFetch('/api/workflows/templates');
      const data = await res.json();
      setTemplates(data);
    } catch {
      setError('Failed to fetch templates');
    }
  }, []);

  // Shared SSE connection logic
  const connectSSE = useCallback(
    async (id: string) => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      activeRunIdRef.current = id;
      setIsRunning(true);
      setTaskProgress({});
      setLiveMetrics({});
      setCooldown(null);
      providerProgressRef.current = {};

      const url = await sseUrl(`/api/workflows/${id}/stream`);
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const parsed = JSON.parse(event.data);

        if (parsed.type === 'task:progress') {
          // Extract iteration progress from SSE event
          const taskId = parsed.data?.taskId as string | undefined;
          const provider = parsed.data?.data?.provider as string | undefined;
          const completed = parsed.data?.data?.completed as number | undefined;
          const total = parsed.data?.data?.total as number | undefined;
          if (taskId && provider && completed != null && total != null) {
            const ref = providerProgressRef.current;
            if (!ref[taskId]) ref[taskId] = {};
            ref[taskId][provider] = { completed, total };
            // Aggregate across providers
            const providers = Object.values(ref[taskId]);
            setTaskProgress((prev) => ({
              ...prev,
              [taskId]: {
                taskId,
                completed: providers.reduce((a, p) => a + p.completed, 0),
                total: providers.reduce((a, p) => a + p.total, 0),
              },
            }));
          }
          // Extract latest iteration metrics for live display
          if (taskId && parsed.data?.data?.latestResults?.length) {
            const results = parsed.data.data.latestResults as Array<{
              success: boolean;
              responseTime: number;
              tokensPerSecond: number;
            }>;
            const successResults = results.filter((r) => r.success);
            if (successResults.length) {
              setLiveMetrics((prev) => ({
                ...prev,
                [taskId]: {
                  avgRT: Math.round(successResults.reduce((a, r) => a + r.responseTime, 0) / successResults.length),
                  avgTPS: Math.round(successResults.reduce((a, r) => a + r.tokensPerSecond, 0) / successResults.length),
                  recentRT: successResults[successResults.length - 1].responseTime,
                },
              }));
            }
          }
        }

        if (parsed.type === 'cooldown') {
          setCooldown({ taskId: parsed.data.nextTaskId, remainingMs: parsed.data.remainingMs });
          fetchWorkflow(id);
        }

        if (
          parsed.type === 'workflow:init' ||
          parsed.type === 'task:start' ||
          parsed.type === 'task:progress' ||
          parsed.type === 'task:complete' ||
          parsed.type === 'task:error'
        ) {
          if (parsed.type === 'task:start') setCooldown(null);
          fetchWorkflow(id);
        }

        if (parsed.type === 'workflow:complete') {
          eventSource.close();
          eventSourceRef.current = null;
          setIsRunning(false);
          setTaskProgress({});
          setLiveMetrics({});
          setCooldown(null);
          providerProgressRef.current = {};
          // Clear ref BEFORE fetch so fetchWorkflow skips the stale ref check.
          // Use the captured `id` (closure) to fetch final state directly.
          activeRunIdRef.current = null;
          // Fetch final workflow state — bypass activeRunIdRef guard
          (async () => {
            try {
              const res = await apiFetch(`/api/workflows/${id}`);
              const data = maskWorkflow((await res.json()) as BenchmarkWorkflow);
              setCurrentWorkflow(data);
            } catch {
              /* fetchWorkflows below will still refresh the list */
            }
          })();
          fetchWorkflows();
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsRunning(false);
        activeRunIdRef.current = null;
        // Fetch latest state directly — bypass activeRunIdRef guard
        (async () => {
          try {
            const res = await apiFetch(`/api/workflows/${id}`);
            const data = maskWorkflow((await res.json()) as BenchmarkWorkflow);
            setCurrentWorkflow(data);
          } catch {
            /* ignore */
          }
        })();
      };
    },
    [fetchWorkflow, fetchWorkflows],
  );

  const startWorkflow = useCallback(
    async (data: CreateWorkflowData) => {
      setError(null);

      try {
        const res = await apiFetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to start workflow');
        }

        const { id } = await res.json();
        connectSSE(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsRunning(false);
        activeRunIdRef.current = null;
      }
    },
    [connectSSE],
  );

  const reconnectActiveWorkflow = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/workflows/active');
      const data = await res.json();
      if (data && data.status === 'running') {
        connectSSE(data.id);
        return true;
      }
    } catch {
      // Silently fail — no active workflow to reconnect
    }
    return false;
  }, [connectSSE]);

  const cancelWorkflow = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await apiFetch(`/api/workflows/${id}/cancel`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          setIsRunning(false);
          activeRunIdRef.current = null;
          fetchWorkflow(id);
          return true;
        }
        return false;
      } catch {
        setError('Failed to cancel workflow');
        return false;
      }
    },
    [fetchWorkflow],
  );

  const exportWorkflow = useCallback(async (id: string, format: 'json' | 'csv') => {
    const url = await downloadUrl(`/api/workflows/${id}/export?format=${format}`);
    window.open(url, '_blank');
  }, []);

  const deleteWorkflow = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await apiFetch(`/api/workflows/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          fetchWorkflows();
          if (currentWorkflow?.id === id) {
            setCurrentWorkflow(null);
          }
          return true;
        }
        return false;
      } catch {
        setError('Failed to delete workflow');
        return false;
      }
    },
    [fetchWorkflows, currentWorkflow],
  );

  const duplicateWorkflow = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        const res = await apiFetch(`/api/workflows/${id}/duplicate`, { method: 'POST' });
        const data = await res.json();
        if (data.id) {
          fetchWorkflows();
          return data.id;
        }
        return null;
      } catch {
        setError('Failed to duplicate workflow');
        return null;
      }
    },
    [fetchWorkflows],
  );

  const clearError = useCallback(() => setError(null), []);

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return {
    workflows,
    currentWorkflow,
    templates,
    isRunning,
    error,
    startWorkflow,
    fetchWorkflows,
    fetchWorkflow,
    fetchTemplates,
    cancelWorkflow,
    exportWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    clearError,
    reconnectActiveWorkflow,
    workflowsLoaded,
    taskProgress,
    liveMetrics,
    cooldown,
  };
}

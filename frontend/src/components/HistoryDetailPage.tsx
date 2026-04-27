import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Spin } from '../antdImports';
import type { InputRef } from 'antd';
import { BenchmarkWorkflow } from '../types';
import { apiFetch, sseUrl } from '../services/api';
import { WorkflowHeader } from './WorkflowHeader';
import { WorkflowProgress } from './WorkflowProgress';
import { WorkflowResults } from './WorkflowResults';
import type { TaskIterationProgress } from '../hooks/useWorkflow';

interface HistoryDetailPageProps {
  workflowId: string;
  onExport?: (id: string, format: 'json' | 'csv') => void;
  onCancel?: (id: string) => Promise<boolean>;
  onBack: () => void;
}

export function HistoryDetailPage({ workflowId, onExport, onCancel, onBack }: HistoryDetailPageProps) {
  const [workflow, setWorkflow] = useState<BenchmarkWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskProgress, setTaskProgress] = useState<Record<string, TaskIterationProgress>>({});
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [liveMetrics, setLiveMetrics] = useState<Record<string, { avgRT: number; avgTPS: number; recentRT: number }>>(
    {},
  );
  const [cooldown, setCooldown] = useState<{ taskId: string; remainingMs: number } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<InputRef>(null);
  const providerProgressRef = useRef<Record<string, Record<string, { completed: number; total: number }>>>({});

  const fetchWorkflow = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}`);
      const data = await res.json();
      setWorkflow(data);
      return data as BenchmarkWorkflow;
    } catch {
      return null;
    }
  }, [workflowId]);

  // Connect SSE for running workflows
  const connectSSE = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    const url = await sseUrl(`/api/workflows/${workflowId}/stream`);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const parsed = JSON.parse(event.data);

      if (parsed.type === 'task:progress') {
        const taskId = parsed.data?.taskId as string | undefined;
        const provider = parsed.data?.data?.provider as string | undefined;
        const completed = parsed.data?.data?.completed as number | undefined;
        const total = parsed.data?.data?.total as number | undefined;
        if (taskId && provider && completed != null && total != null) {
          const ref = providerProgressRef.current;
          if (!ref[taskId]) ref[taskId] = {};
          ref[taskId][provider] = { completed, total };
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

      if (
        parsed.type === 'workflow:init' ||
        parsed.type === 'task:start' ||
        parsed.type === 'task:progress' ||
        parsed.type === 'task:complete' ||
        parsed.type === 'task:error'
      ) {
        if (parsed.type === 'task:start') setCooldown(null);
        fetchWorkflow();
      }

      if (parsed.type === 'cooldown') {
        setCooldown({ taskId: parsed.data.nextTaskId, remainingMs: parsed.data.remainingMs });
        fetchWorkflow();
      }

      if (parsed.type === 'workflow:complete') {
        es.close();
        eventSourceRef.current = null;
        setTaskProgress({});
        setLiveMetrics({});
        setCooldown(null);
        providerProgressRef.current = {};
        fetchWorkflow();
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      fetchWorkflow();
    };
  }, [workflowId, fetchWorkflow]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setTaskProgress({});
    providerProgressRef.current = {};

    fetchWorkflow().then((data) => {
      if (cancelled) return;
      setLoading(false);
      if (data && data.status === 'running') {
        connectSSE();
      }
    });

    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [workflowId, fetchWorkflow, connectSSE]);

  const displayName = workflow?.name || workflow?.id.slice(0, 8) || '';

  const startEditing = () => {
    setEditName(displayName);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === displayName) {
      setEditing(false);
      return;
    }
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const updated = await res.json();
        setWorkflow((prev) => (prev ? { ...prev, name: updated.name } : prev));
      }
    } catch {
      /* no-op: name update is non-critical */
    }
    setEditing(false);
  };

  if (loading || !workflow) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card p-16 flex items-center justify-center min-h-[400px]"
      >
        <Spin size="large" />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <WorkflowHeader
        workflow={workflow}
        onCancel={onCancel}
        onExport={onExport}
        onBack={onBack}
        editing={editing}
        editName={editName}
        onStartEditing={startEditing}
        onSaveName={saveName}
        onCancelEditing={cancelEditing}
        onEditNameChange={setEditName}
        inputRef={inputRef}
      />

      {/* Progress */}
      <WorkflowProgress workflow={workflow} taskProgress={taskProgress} liveMetrics={liveMetrics} cooldown={cooldown} />

      {/* Results */}
      {workflow.summary && <WorkflowResults workflow={workflow} />}
    </motion.div>
  );
}

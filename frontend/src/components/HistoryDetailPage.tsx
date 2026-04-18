import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown, Tooltip, Tag, Spin } from '../antdImports';
import { BenchmarkWorkflow, getProviderColor, getProviderDisplayName } from '../types';
import { apiFetch, sseUrl } from '../services/api';
import { WorkflowProgress } from './WorkflowProgress';
import { WorkflowResults } from './WorkflowResults';
import type { TaskIterationProgress } from '../hooks/useWorkflow';

interface HistoryDetailPageProps {
  workflowId: string;
  onExport?: (id: string, format: 'json' | 'csv') => void;
  onBack: () => void;
}

function statusToTagColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'running':
      return 'orange';
    case 'failed':
      return 'red';
    default:
      return 'default';
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function HistoryDetailPage({ workflowId, onExport, onBack }: HistoryDetailPageProps) {
  const [workflow, setWorkflow] = useState<BenchmarkWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskProgress, setTaskProgress] = useState<Record<string, TaskIterationProgress>>({});
  const eventSourceRef = useRef<EventSource | null>(null);
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
      }

      if (
        parsed.type === 'workflow:init' ||
        parsed.type === 'task:start' ||
        parsed.type === 'task:progress' ||
        parsed.type === 'task:complete' ||
        parsed.type === 'task:error' ||
        parsed.type === 'cooldown'
      ) {
        fetchWorkflow();
      }

      if (parsed.type === 'workflow:complete') {
        es.close();
        eventSourceRef.current = null;
        setTaskProgress({});
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

  const exportMenuItems = onExport
    ? [
        { key: 'json', label: 'Export JSON' },
        { key: 'csv', label: 'Export CSV' },
      ]
    : [];

  const handleExportClick = ({ key }: { key: string }) => {
    if (onExport) {
      onExport(workflowId, key as 'json' | 'csv');
    }
  };

  // Compute token stats from summary or provider summaries
  const tokenStats = (() => {
    if (!workflow.summary) return null;
    const summaries = Object.values(workflow.summary.providerSummaries);
    const inputTokens =
      workflow.summary.totalInputTokens || summaries.reduce((a, s) => a + (s.totalInputTokens || 0), 0);
    const outputTokens =
      workflow.summary.totalOutputTokens || summaries.reduce((a, s) => a + (s.totalOutputTokens || 0), 0);
    if (inputTokens === 0 && outputTokens === 0) return null;
    return { inputTokens, outputTokens };
  })();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              className="text-text-secondary hover:text-text-primary"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-text-primary">{workflow.name || workflow.id.slice(0, 8)}</h3>
                <Tag
                  color={statusToTagColor(workflow.status)}
                  style={{ fontSize: '11px', margin: 0 }}
                  className="font-mono"
                >
                  {workflow.status}
                </Tag>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap max-w-full">
                {workflow.summary
                  ? Object.entries(workflow.summary.providerSummaries)
                      .sort(([, a], [, b]) => {
                        const cmp = a.provider.localeCompare(b.provider);
                        if (cmp !== 0) return cmp;
                        return a.model.localeCompare(b.model);
                      })
                      .map(([key, ps]) => (
                        <Tag
                          key={key}
                          style={{
                            backgroundColor: `${getProviderColor(key)}0a`,
                            color: getProviderColor(key),
                            border: `1px solid ${getProviderColor(key)}20`,
                            fontSize: '10px',
                            margin: 0,
                            fontFamily: 'monospace',
                            maxWidth: '100%',
                          }}
                        >
                          <span className="truncate max-w-[180px] inline-block align-bottom">
                            {ps.provider}/{ps.model}
                          </span>
                        </Tag>
                      ))
                  : workflow.providers.map((p) => (
                      <Tag
                        key={p}
                        style={{
                          backgroundColor: `${getProviderColor(p)}0a`,
                          color: getProviderColor(p),
                          border: `1px solid ${getProviderColor(p)}20`,
                          fontSize: '10px',
                          margin: 0,
                        }}
                      >
                        {workflow.providerLabels?.[p] || getProviderDisplayName(p)}
                      </Tag>
                    ))}
                <span className="text-[10px] text-text-tertiary font-mono ml-2">
                  {workflow.tasks?.length ?? 0} tasks · {formatDate(workflow.createdAt)}
                </span>
              </div>
              {/* Token Stats */}
              {tokenStats && (
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-[11px] text-text-secondary font-mono">
                    Input Tokens: <span className="text-accent-blue">{tokenStats.inputTokens.toLocaleString()}</span>
                  </span>
                  <span className="text-[11px] text-text-secondary font-mono">
                    Output Tokens: <span className="text-accent-teal">{tokenStats.outputTokens.toLocaleString()}</span>
                  </span>
                  <span className="text-[11px] text-text-secondary font-mono">
                    Ratio (In:Out):{' '}
                    <span className="text-accent-violet">
                      {tokenStats.outputTokens > 0 && tokenStats.inputTokens > 0
                        ? (() => {
                            const r = tokenStats.inputTokens / tokenStats.outputTokens;
                            if (r >= 10) return `${Math.round(r)}:1`;
                            return `${r.toFixed(2)}:1`;
                          })()
                        : '-'}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
          {onExport && (
            <Dropdown menu={{ items: exportMenuItems, onClick: handleExportClick }}>
              <Tooltip title="Export results">
                <Button size="small" icon={<DownloadOutlined />}>
                  Export
                </Button>
              </Tooltip>
            </Dropdown>
          )}
        </div>
      </div>

      {/* Progress */}
      <WorkflowProgress workflow={workflow} taskProgress={taskProgress} />

      {/* Results */}
      {workflow.summary && <WorkflowResults workflow={workflow} />}
    </motion.div>
  );
}

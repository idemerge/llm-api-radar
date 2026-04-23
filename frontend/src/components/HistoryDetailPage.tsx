import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftOutlined, DownloadOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Dropdown, Tooltip, Tag, Spin, Input } from '../antdImports';
import type { InputRef } from 'antd';
import { BenchmarkWorkflow, getProviderColor, getProviderDisplayName } from '../types';
import { apiFetch, sseUrl } from '../services/api';
import { WorkflowProgress } from './WorkflowProgress';
import { WorkflowResults } from './WorkflowResults';
import type { TaskIterationProgress } from '../hooks/useWorkflow';

interface HistoryDetailPageProps {
  workflowId: string;
  onExport?: (id: string, format: 'json' | 'csv') => void;
  onCancel?: (id: string) => Promise<boolean>;
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
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
    } catch {}
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
    // Average throughput across providers
    const avgInputThroughput = summaries.length
      ? Math.round(summaries.reduce((a, s) => a + (s.inputThroughput || 0), 0) / summaries.length)
      : 0;
    const avgOutputThroughput = summaries.length
      ? Math.round(summaries.reduce((a, s) => a + (s.outputThroughput || 0), 0) / summaries.length)
      : 0;
    const avgTotalThroughput = summaries.length
      ? Math.round(summaries.reduce((a, s) => a + (s.totalThroughput || 0), 0) / summaries.length)
      : 0;
    return { inputTokens, outputTokens, avgInputThroughput, avgOutputThroughput, avgTotalThroughput };
  })();

  const isCompleted =
    workflow.status === 'completed' || workflow.status === 'failed' || workflow.status === 'cancelled';

  // Compute stat cards for completed workflows
  const statCards =
    isCompleted && workflow.summary
      ? (() => {
          const s = workflow.summary;
          const ps = Object.values(s.providerSummaries);
          const bestRT = ps.length ? Math.min(...ps.map((p) => p.avgResponseTime)) : 0;
          const avgSuccess = ps.length ? ps.reduce((a, p) => a + p.overallSuccessRate, 0) / ps.length : 0;
          const avgInT = ps.length ? Math.round(ps.reduce((a, p) => a + (p.inputThroughput || 0), 0) / ps.length) : 0;
          const avgOutT = ps.length ? Math.round(ps.reduce((a, p) => a + (p.outputThroughput || 0), 0) / ps.length) : 0;
          const avgTotalT = ps.length
            ? Math.round(ps.reduce((a, p) => a + (p.totalThroughput || 0), 0) / ps.length)
            : 0;
          return { s, bestRT, avgSuccess, avgInT, avgOutT, avgTotalT };
        })()
      : null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className={`glass-card p-5${workflow.status === 'running' ? ' running-card-glow' : ''}`}>
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
                {editing ? (
                  <Input
                    ref={inputRef}
                    size="small"
                    className="text-sm font-medium"
                    style={{ width: Math.max(240, editName.length * 10 + 60) }}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onPressEnter={saveName}
                    addonAfter={
                      <div className="flex items-center gap-2">
                        <CheckOutlined className="text-green-500 cursor-pointer text-xs" onClick={saveName} />
                        <CloseOutlined className="text-text-tertiary cursor-pointer text-xs" onClick={cancelEditing} />
                      </div>
                    }
                  />
                ) : (
                  <span
                    className="text-sm font-medium text-text-primary cursor-pointer rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-border transition-colors group"
                    onClick={startEditing}
                  >
                    {displayName}
                    <EditOutlined className="text-text-tertiary text-[10px] ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                )}
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workflow.status === 'running' && onCancel && (
              <Button size="small" danger onClick={() => onCancel(workflowId)}>
                Cancel
              </Button>
            )}
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

        {/* Stat Cards Dashboard — completed/failed/cancelled only */}
        {statCards && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-4">
            <Tooltip title="Total wall-clock time from first task start to last task completion">
              <div className="stat-card">
                <span className="stat-value text-accent-blue">{formatDuration(statCards.s.totalDuration)}</span>
                <span className="stat-label">Duration</span>
              </div>
            </Tooltip>
            <Tooltip title="Total tokens consumed across all providers and tasks">
              <div className="stat-card">
                <span className="stat-value text-accent-violet">{statCards.s.totalTokens.toLocaleString()}</span>
                <span className="stat-label">Tokens</span>
              </div>
            </Tooltip>
            <Tooltip title="Best average response time among all providers">
              <div className="stat-card">
                <span className="stat-value text-accent-teal">{statCards.bestRT.toLocaleString()}ms</span>
                <span className="stat-label">Best Avg RT</span>
              </div>
            </Tooltip>
            <Tooltip title="Average success rate across all providers">
              <div className="stat-card">
                <span
                  className={`stat-value ${statCards.avgSuccess >= 0.95 ? 'text-accent-teal' : statCards.avgSuccess >= 0.8 ? 'text-accent-amber' : 'text-accent-rose'}`}
                >
                  {(statCards.avgSuccess * 100).toFixed(1)}%
                </span>
                <span className="stat-label">Success Rate</span>
              </div>
            </Tooltip>
            <Tooltip title="Estimated total cost based on provider pricing">
              <div className="stat-card">
                <span className="stat-value text-accent-coral">${statCards.s.totalCost.toFixed(4)}</span>
                <span className="stat-label">Est. Cost</span>
              </div>
            </Tooltip>
            <Tooltip title="Avg total throughput across providers (concurrency × tokens / response time)">
              <div className="stat-card">
                <span className="stat-value text-accent-violet">
                  {statCards.avgTotalT > 0 ? statCards.avgTotalT.toLocaleString() : '-'}
                </span>
                <span className="stat-label">Total T/s</span>
              </div>
            </Tooltip>
          </div>
        )}

        {/* Token Stats — running state inline display */}
        {tokenStats && !isCompleted && (
          <>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Tooltip title="Total input tokens sent to the API across all requests">
                <span className="text-[11px] text-text-secondary font-mono cursor-help">
                  Input Tokens: <span className="text-accent-blue">{tokenStats.inputTokens.toLocaleString()}</span>
                </span>
              </Tooltip>
              <Tooltip title="Total output tokens generated by the model across all requests">
                <span className="text-[11px] text-text-secondary font-mono cursor-help">
                  Output Tokens: <span className="text-accent-teal">{tokenStats.outputTokens.toLocaleString()}</span>
                </span>
              </Tooltip>
              <Tooltip title="Ratio of input tokens to output tokens">
                <span className="text-[11px] text-text-secondary font-mono cursor-help">
                  Ratio:{' '}
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
              </Tooltip>
            </div>
            {(tokenStats.avgInputThroughput > 0 || tokenStats.avgOutputThroughput > 0) && (
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <Tooltip title="Input throughput">
                  <span className="text-[11px] text-text-secondary font-mono cursor-help">
                    In T/s: <span className="text-accent-blue">{tokenStats.avgInputThroughput.toLocaleString()}</span>
                  </span>
                </Tooltip>
                <Tooltip title="Output throughput">
                  <span className="text-[11px] text-text-secondary font-mono cursor-help">
                    Out T/s: <span className="text-accent-teal">{tokenStats.avgOutputThroughput.toLocaleString()}</span>
                  </span>
                </Tooltip>
                <Tooltip title="Total throughput">
                  <span className="text-[11px] text-text-secondary font-mono cursor-help">
                    Total T/s:{' '}
                    <span className="text-accent-violet">{tokenStats.avgTotalThroughput.toLocaleString()}</span>
                  </span>
                </Tooltip>
              </div>
            )}
          </>
        )}
      </div>

      {/* Progress */}
      <WorkflowProgress workflow={workflow} taskProgress={taskProgress} liveMetrics={liveMetrics} cooldown={cooldown} />

      {/* Results */}
      {workflow.summary && <WorkflowResults workflow={workflow} />}
    </motion.div>
  );
}

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Table, Tag, Empty, Popconfirm, Tooltip } from '../antdImports';
import {
  CopyOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleFilled,
  MinusCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons';
import { BenchmarkWorkflow, getProviderColor } from '../types';

interface HistoryPanelProps {
  workflows: BenchmarkWorkflow[];
  onSelectWorkflow: (id: string) => void;
  onDeleteWorkflow: (id: string) => Promise<boolean>;
  onDuplicateWorkflow: (id: string) => void;
  onRefresh?: () => void;
  selectedId?: string;
  loading?: boolean;
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function StatusIcon({ status }: { status: string }) {
  const wrap = (bg: string, icon: React.ReactNode) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: bg,
      }}
    >
      {icon}
    </span>
  );
  switch (status) {
    case 'completed':
      return wrap('rgba(115,191,105,0.15)', <CheckCircleFilled style={{ fontSize: 12, color: '#73bf69' }} />);
    case 'running':
      return wrap('rgba(255,152,48,0.15)', <LoadingOutlined style={{ fontSize: 12, color: '#ff9830' }} spin />);
    case 'failed':
      return wrap('rgba(242,73,92,0.15)', <CloseCircleFilled style={{ fontSize: 12, color: '#f2495c' }} />);
    case 'cancelled':
      return wrap(
        'rgba(255,255,255,0.05)',
        <MinusCircleFilled style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }} />,
      );
    default:
      return wrap(
        'rgba(255,255,255,0.05)',
        <ClockCircleFilled style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }} />,
      );
  }
}

/** Compact config chip: "5c × 10i" */
function ConfigChips({ record }: { record: BenchmarkWorkflow }) {
  const tasks = record.tasks || [];
  if (tasks.length === 0) return null;

  const concurrencies = tasks.map((t) => t.config.concurrency);
  const iterations = tasks.map((t) => t.config.iterations);
  const maxTokens = tasks.map((t) => t.config.maxTokens);
  const streamings = [...new Set(tasks.map((t) => t.config.streaming))];
  const cacheRates = tasks.map((t) => t.config.targetCacheHitRate).filter((r): r is number => r != null);

  const uniqConc = [...new Set(concurrencies)];
  const uniqIter = [...new Set(iterations)];
  const uniqTok = [...new Set(maxTokens)];

  const concLabel = uniqConc.length === 1 ? `${uniqConc[0]}c` : `${Math.min(...uniqConc)}-${Math.max(...uniqConc)}c`;
  const iterLabel = uniqIter.length === 1 ? `${uniqIter[0]}i` : `${Math.min(...uniqIter)}-${Math.max(...uniqIter)}i`;
  const tokLabel = uniqTok.length === 1 ? `${uniqTok[0] >= 1000 ? `${uniqTok[0] / 1000}k` : uniqTok[0]}t` : null;

  return (
    <span className="text-[10px] text-text-tertiary font-mono">
      {tasks.length > 1 && <span className="text-accent-violet/70">{tasks.length} tasks · </span>}
      {concLabel} × {iterLabel}
      {tokLabel && <span> × {tokLabel}</span>}
      {cacheRates.length > 0 && (
        <span> · cache {((cacheRates.reduce((a, b) => a + b, 0) / cacheRates.length) * 100).toFixed(0)}%</span>
      )}
      {streamings.length === 1 && streamings[0] && <span> · stream</span>}
    </span>
  );
}

export function HistoryPanel({
  workflows,
  onSelectWorkflow,
  onDeleteWorkflow,
  onDuplicateWorkflow,
  onRefresh,
  selectedId,
  loading,
}: HistoryPanelProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const getProviderLabel = (record: BenchmarkWorkflow, providerKey: string): string => {
    if (record.providerLabels?.[providerKey]) return record.providerLabels[providerKey];
    if (providerKey.includes(':')) return providerKey.split(':', 2)[1];
    return providerKey;
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await onDeleteWorkflow(id);
    setDeletingId(null);
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    await onDuplicateWorkflow(id);
    setDuplicatingId(null);
  };

  if (loading || !workflows) {
    return (
      <div className="glass-card p-10 flex items-center justify-center min-h-[300px]">
        <div className="text-text-tertiary text-sm">Loading...</div>
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card p-10 flex flex-col items-center justify-center min-h-[300px] text-center"
      >
        <Empty description="No Workflows Yet" />
        <p className="text-text-secondary text-sm mt-2">Run your first workflow to see results here.</p>
      </motion.div>
    );
  }

  const sorted = [...workflows].sort(
    (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime(),
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-text-primary">
          History
          <span className="ml-2 text-sm text-text-secondary font-normal font-mono">({sorted.length})</span>
        </h2>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent-blue/30 rounded transition-all"
          >
            <ReloadOutlined style={{ fontSize: 12 }} />
            Refresh
          </button>
        )}
      </div>

      {/* Table */}
      <Table
        columns={[
          {
            title: '',
            key: 'statusIcon',
            width: 36,
            render: (_: unknown, record: BenchmarkWorkflow) => <StatusIcon status={record.status} />,
          },
          {
            title: 'Workflow',
            key: 'main',
            render: (_: unknown, record: BenchmarkWorkflow) => {
              const successRate = record.summary
                ? Object.values(record.summary.providerSummaries).reduce((a, ps) => a + ps.overallSuccessRate, 0) /
                  Object.keys(record.summary.providerSummaries).length
                : null;

              return (
                <div className="min-w-0 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-text-primary font-medium">
                      {record.name || record.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-text-tertiary font-mono flex-shrink-0">
                      {formatRelativeDate(record.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <ConfigChips record={record} />
                    {successRate !== null && (
                      <span
                        className={`text-[10px] font-mono ${successRate >= 0.95 ? 'text-accent-teal' : successRate >= 0.8 ? 'text-accent-amber' : 'text-accent-rose'}`}
                      >
                        {(successRate * 100).toFixed(0)}% ok
                      </span>
                    )}
                  </div>
                </div>
              );
            },
          },
          {
            title: 'Models',
            key: 'models',
            width: 240,
            render: (_: unknown, record: BenchmarkWorkflow) => {
              const models = record.summary
                ? Object.entries(record.summary.providerSummaries)
                    .sort(([, a], [, b]) => {
                      const cmp = a.provider.localeCompare(b.provider);
                      if (cmp !== 0) return cmp;
                      return a.model.localeCompare(b.model);
                    })
                    .map(([key, ps]) => ({
                      key,
                      label: `${ps.provider}/${ps.model}`,
                      color: getProviderColor(key),
                    }))
                : (record.providers || []).map((p) => ({
                    key: p,
                    label: getProviderLabel(record, p),
                    color: getProviderColor(p),
                  }));
              return (
                <div className="flex items-center gap-1 flex-wrap">
                  {models.slice(0, 3).map((m) => (
                    <Tag
                      key={m.key}
                      style={{
                        backgroundColor: `${m.color}0a`,
                        color: m.color,
                        border: `1px solid ${m.color}20`,
                        fontSize: '10px',
                        margin: 0,
                        fontFamily: 'monospace',
                        lineHeight: '14px',
                        padding: '0 3px',
                      }}
                    >
                      {m.label}
                    </Tag>
                  ))}
                  {models.length > 3 && (
                    <span className="text-[10px] text-text-tertiary font-mono">+{models.length - 3}</span>
                  )}
                </div>
              );
            },
          },
          {
            title: 'Duration',
            key: 'duration',
            width: 80,
            align: 'right' as const,
            render: (_: unknown, record: BenchmarkWorkflow) => {
              const ms =
                record.startedAt && record.completedAt
                  ? new Date(record.completedAt).getTime() - new Date(record.startedAt).getTime()
                  : 0;
              return (
                <span className="text-[12px] text-accent-blue font-mono">{ms > 0 ? formatDuration(ms) : '-'}</span>
              );
            },
          },
          {
            title: 'Tokens',
            key: 'tokens',
            width: 72,
            align: 'right' as const,
            render: (_: unknown, record: BenchmarkWorkflow) => {
              const tokens = record.summary?.totalTokens;
              return (
                <span className="text-[12px] text-accent-violet font-mono">
                  {tokens ? (tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString()) : '-'}
                </span>
              );
            },
          },
          {
            title: '',
            key: 'actions',
            width: 56,
            align: 'center' as const,
            render: (_: unknown, record: BenchmarkWorkflow) => (
              <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Duplicate">
                  <CopyOutlined
                    className={`text-[12px] ${duplicatingId === record.id ? 'text-text-tertiary' : 'text-accent-blue/50 hover:text-accent-blue'} cursor-pointer transition-colors`}
                    onClick={() => handleDuplicate(record.id)}
                  />
                </Tooltip>
                {record.status !== 'running' && (
                  <Popconfirm
                    title="Delete this workflow?"
                    description="This action cannot be undone."
                    onConfirm={() => handleDelete(record.id)}
                    okText="Delete"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true, size: 'small' }}
                    cancelButtonProps={{ size: 'small' }}
                  >
                    <Tooltip title="Delete">
                      <DeleteOutlined
                        className={`text-[12px] ${deletingId === record.id ? 'text-text-tertiary' : 'text-accent-rose/40 hover:text-accent-rose'} cursor-pointer transition-colors`}
                      />
                    </Tooltip>
                  </Popconfirm>
                )}
              </div>
            ),
          },
        ]}
        dataSource={sorted}
        rowKey="id"
        size="small"
        pagination={sorted.length > 20 ? { pageSize: 20, size: 'small' } : false}
        rowClassName={(record) =>
          `cursor-pointer transition-colors ${record.id === selectedId ? 'history-row-selected' : 'hover:bg-bg-elevated/50'}`
        }
        onRow={(record) => ({
          onClick: () => onSelectWorkflow(record.id),
        })}
      />
    </motion.div>
  );
}

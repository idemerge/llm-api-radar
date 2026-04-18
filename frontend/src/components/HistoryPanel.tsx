import { useState } from 'react';
import { motion } from 'framer-motion';
import { Table, Tag, Empty, Popconfirm, Tooltip } from '../antdImports';
import { CopyOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
    // Prefer snapshot labels stored at creation time
    if (record.providerLabels?.[providerKey]) return record.providerLabels[providerKey];
    // Fallback: extract model name from composite key
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

  // Sort by date descending
  const sorted = [...workflows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
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
            title: 'Date',
            dataIndex: 'createdAt',
            key: 'date',
            width: 180,
            render: (val: string) => (
              <span className="text-[12px] text-text-secondary font-mono">{formatDate(val)}</span>
            ),
          },
          {
            title: 'Name',
            key: 'name',
            render: (_: unknown, record: BenchmarkWorkflow) => (
              <span className="text-[12px] text-text-primary font-medium truncate max-w-[260px] block">
                {record.name || record.id.slice(0, 8)}
              </span>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 90,
            render: (val: string) => (
              <Tag color={statusToTagColor(val)} style={{ fontSize: '11px', margin: 0 }} className="font-mono">
                {val}
              </Tag>
            ),
          },
          {
            title: 'Models',
            key: 'models',
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
                      }}
                    >
                      {m.label}
                    </Tag>
                  ))}
                  {models.length > 3 && <span className="text-[10px] text-text-tertiary">+{models.length - 3}</span>}
                </div>
              );
            },
          },
          {
            title: 'Tasks',
            key: 'taskCount',
            width: 60,
            align: 'right' as const,
            render: (_: unknown, record: BenchmarkWorkflow) => (
              <span className="text-[12px] text-accent-violet font-mono">{record.tasks?.length ?? '-'}</span>
            ),
          },
          {
            title: 'Conc.',
            key: 'concurrency',
            width: 90,
            align: 'right' as const,
            render: (_: unknown, record: BenchmarkWorkflow) => {
              const values = (record.tasks || []).map((t) => t.config.concurrency);
              if (values.length === 0) return <span className="text-[12px] text-text-tertiary font-mono">-</span>;
              const unique = [...new Set(values)];
              const label = unique.length === 1 ? `${unique[0]}` : `${Math.min(...values)}-${Math.max(...values)}`;
              return <span className="text-[12px] text-text-secondary font-mono">{label}</span>;
            },
          },
          {
            title: 'Iter.',
            key: 'iterations',
            width: 80,
            align: 'right' as const,
            render: (_: unknown, record: BenchmarkWorkflow) => {
              const values = (record.tasks || []).map((t) => t.config.iterations);
              if (values.length === 0) return <span className="text-[12px] text-text-tertiary font-mono">-</span>;
              const unique = [...new Set(values)];
              const label = unique.length === 1 ? `${unique[0]}` : `${Math.min(...values)}-${Math.max(...values)}`;
              return <span className="text-[12px] text-text-secondary font-mono">{label}</span>;
            },
          },
          {
            title: 'Actions',
            key: 'actions',
            width: 90,
            align: 'center' as const,
            render: (_: unknown, record: BenchmarkWorkflow) => (
              <div className="flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Duplicate">
                  <CopyOutlined
                    className={`text-[13px] ${duplicatingId === record.id ? 'text-text-tertiary' : 'text-accent-blue/60 hover:text-accent-blue'} cursor-pointer transition-colors`}
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
                        className={`text-[13px] ${deletingId === record.id ? 'text-text-tertiary' : 'text-accent-rose/50 hover:text-accent-rose'} cursor-pointer transition-colors`}
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
        rowClassName={(record) => (record.id === selectedId ? 'history-row-selected' : '')}
        onRow={(record) => ({
          onClick: () => onSelectWorkflow(record.id),
          style: { cursor: 'pointer' },
        })}
      />
    </motion.div>
  );
}

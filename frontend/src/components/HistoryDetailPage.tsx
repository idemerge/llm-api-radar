import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown, Tooltip, Tag, Spin } from '../antdImports';
import { BenchmarkWorkflow, getProviderColor, getProviderDisplayName } from '../types';
import { apiFetch } from '../services/api';
import { WorkflowProgress } from './WorkflowProgress';
import { WorkflowResults } from './WorkflowResults';

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/workflows/${workflowId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setWorkflow(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

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
      <WorkflowProgress workflow={workflow} />

      {/* Results */}
      {workflow.summary && <WorkflowResults workflow={workflow} />}
    </motion.div>
  );
}

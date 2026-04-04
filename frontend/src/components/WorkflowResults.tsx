import { useState } from 'react';
import { motion } from 'framer-motion';
import { DownloadOutlined } from '@ant-design/icons';
import { Button, Table, Tabs, Tag, Dropdown, Tooltip } from '../antdImports';
import { BenchmarkWorkflow, getProviderColor, getProviderDisplayName, TaskMetricPoint } from '../types';
import { MetricCard } from './MetricCard';

interface WorkflowResultsProps {
  workflow: BenchmarkWorkflow | null;
  onExport?: (id: string, format: 'json' | 'csv') => void;
}

type TabType = 'overview' | 'tasks';

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/** Horizontal bar chart comparing providers on a single metric */
function MetricBarChart({ label, items, unit }: {
  label: string;
  items: { providerKey: string; label: string; value: number }[];
  unit?: string;
}) {
  if (items.length === 0) return null;
  const maxVal = Math.max(...items.map((i) => i.value), 1) * 1.15;
  const barHeight = 16;
  const gap = 6;
  const labelWidth = 130;
  const valueWidth = 60;
  const chartWidth = 360;
  const barAreaWidth = chartWidth - labelWidth - valueWidth;
  const svgHeight = items.length * (barHeight + gap) + 4;

  return (
    <div className="space-y-1">
      <span className="text-[10px] text-text-secondary font-medium">{label}</span>
      <svg viewBox={`0 0 ${chartWidth} ${svgHeight}`} className="w-full" style={{ minWidth: 300 }}>
        {items.map((item, i) => {
          const y = i * (barHeight + gap);
          const barW = (item.value / maxVal) * barAreaWidth;
          const color = getProviderColor(item.providerKey);
          return (
            <g key={item.providerKey}>
              <text x={labelWidth - 6} y={y + barHeight * 0.75} textAnchor="end" fill="rgba(255,255,255,0.5)" fontSize="8">
                {item.label}
              </text>
              <rect x={labelWidth} y={y} width={barAreaWidth} height={barHeight} rx="2" fill="rgba(255,255,255,0.03)" />
              <rect x={labelWidth} y={y} width={barW} height={barHeight} rx="2" fill={color} opacity="0.75" />
              <text x={labelWidth + barAreaWidth + 4} y={y + barHeight * 0.75} fill="rgba(255,255,255,0.6)" fontSize="8">
                {formatNumber(item.value)}{unit || ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function WorkflowResults({ workflow, onExport }: WorkflowResultsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (!workflow || !workflow.summary) return null;

  const { summary } = workflow;
  const providers = Object.keys(summary.providerSummaries);

  // Build metrics by provider
  const metricsByProvider: Record<string, TaskMetricPoint[]> = {};
  for (const [provider, ps] of Object.entries(summary.providerSummaries)) {
    metricsByProvider[provider] = [...ps.perTaskMetrics].sort((a, b) => a.taskOrder - b.taskOrder);
  }

  // Overview table columns
  const overviewColumns = [
    {
      title: 'Provider',
      dataIndex: 'providerName',
      key: 'providerName',
      render: (name: string, record: { providerKey: string }) => (
        <span style={{ color: getProviderColor(record.providerKey), fontWeight: 500 }}>
          {name}
        </span>
      ),
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      render: (model: string, record: { providerKey: string }) => (
        <span style={{ color: getProviderColor(record.providerKey), opacity: 0.8 }} className="font-mono text-[12px]">{model}</span>
      ),
    },
    {
      title: 'Avg RT',
      dataIndex: 'avgResponseTime',
      key: 'avgResponseTime',
      align: 'right' as const,
      render: (val: number) => `${formatNumber(val)}ms`,
    },
    {
      title: 'Avg TTFT',
      dataIndex: 'avgFirstTokenLatency',
      key: 'avgFirstTokenLatency',
      align: 'right' as const,
      render: (val: number) => `${formatNumber(val)}ms`,
    },
    {
      title: 'TPS',
      dataIndex: 'avgTokensPerSecond',
      key: 'avgTokensPerSecond',
      align: 'right' as const,
      render: (val: number) => formatNumber(val),
    },
    {
      title: 'Tokens',
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      align: 'right' as const,
      render: (val: number) => formatNumber(val),
    },
    {
      title: 'Success',
      dataIndex: 'overallSuccessRate',
      key: 'overallSuccessRate',
      align: 'right' as const,
      render: (val: number) => {
        const pct = val * 100;
        const color = pct >= 95 ? 'green' : pct >= 80 ? 'orange' : 'red';
        return <Tag color={color}>{pct.toFixed(1)}%</Tag>;
      },
    },
  ];

  const overviewDataSource = providers.map((p) => {
    const ps = summary.providerSummaries[p];
    return {
      key: p,
      providerKey: p,
      providerName: ps.provider,
      model: ps.model,
      ...ps,
    };
  }).sort((a, b) => {
    const cmp = a.providerName.localeCompare(b.providerName);
    if (cmp !== 0) return cmp;
    return a.model.localeCompare(b.model);
  });

  // Export dropdown items
  const exportMenuItems = onExport
    ? [
        { key: 'json', label: 'Export JSON' },
        { key: 'csv', label: 'Export CSV' },
      ]
    : [];

  const handleExportClick = ({ key }: { key: string }) => {
    if (onExport) {
      onExport(workflow.id, key as 'json' | 'csv');
    }
  };

  // Tab items
  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-5">
            <MetricCard title="Avg Response Time" value={formatNumber(
              providers.reduce((acc, p) => acc + summary.providerSummaries[p].avgResponseTime, 0) / providers.length
            )} unit="ms" color="#5b8def" delay={0} />
            <MetricCard title="Avg Throughput" value={formatNumber(
              providers.reduce((acc, p) => acc + summary.providerSummaries[p].avgTokensPerSecond, 0) / providers.length
            )} unit="tok/s" color="#73bf69" delay={0.05} />
            <MetricCard title="Avg TTFT" value={formatNumber(
              providers.reduce((acc, p) => acc + summary.providerSummaries[p].avgFirstTokenLatency, 0) / providers.length
            )} unit="ms" color="#a78bfa" delay={0.1} />
            <MetricCard title="Success Rate" value={`${formatNumber(
              (providers.reduce((acc, p) => acc + summary.providerSummaries[p].overallSuccessRate, 0) / providers.length) * 100, 1
            )}%`} color="#73bf69" delay={0.15} />
          </div>

          {/* Provider Summary Table */}
          <Table
            columns={overviewColumns}
            dataSource={overviewDataSource}
            pagination={false}
            size="small"
          />
        </div>
      ),
    },
    {
      key: 'tasks',
      label: 'By Task',
      children: (
        <div className="space-y-5">
          {workflow.tasks.map((task, index) => {
            const result = workflow.taskResults[index];
            if (result?.status !== 'completed') return null;

            const taskColumns = [
              {
                title: 'Provider',
                dataIndex: 'providerName',
                key: 'providerName',
                render: (name: string, record: { providerKey: string }) => (
                  <span style={{ color: getProviderColor(record.providerKey), fontWeight: 500 }}>
                    {name}
                  </span>
                ),
              },
              {
                title: 'Model',
                dataIndex: 'model',
                key: 'model',
                render: (model: string, record: { providerKey: string }) => (
                  <span style={{ color: getProviderColor(record.providerKey), opacity: 0.8 }} className="font-mono text-[12px]">{model}</span>
                ),
              },
              {
                title: 'Avg RT',
                dataIndex: 'avgResponseTime',
                key: 'avgResponseTime',
                align: 'right' as const,
                render: (val: number) => `${formatNumber(val)}ms`,
              },
              {
                title: 'P95 RT',
                dataIndex: 'p95ResponseTime',
                key: 'p95ResponseTime',
                align: 'right' as const,
                render: (val: number) => `${formatNumber(val)}ms`,
              },
              {
                title: 'TTFT',
                dataIndex: 'avgFirstTokenLatency',
                key: 'avgFirstTokenLatency',
                align: 'right' as const,
                render: (val: number) => `${formatNumber(val)}ms`,
              },
              {
                title: 'TPS',
                dataIndex: 'avgTokensPerSecond',
                key: 'avgTokensPerSecond',
                align: 'right' as const,
                render: (val: number) => formatNumber(val),
              },
              {
                title: 'Success',
                dataIndex: 'successRate',
                key: 'successRate',
                align: 'right' as const,
                render: (val: number) => {
                  const pct = val * 100;
                  const color = pct >= 95 ? 'green' : pct >= 80 ? 'orange' : 'red';
                  return <Tag color={color}>{pct.toFixed(1)}%</Tag>;
                },
              },
            ];

            const taskDataSource = providers
              .map((p) => {
                const taskMetric = metricsByProvider[p]?.find((m) => m.taskId === task.id);
                if (!taskMetric) return null;
                const ps = summary.providerSummaries[p];
                return {
                  key: p,
                  providerKey: p,
                  providerName: ps?.provider || '',
                  model: ps?.model || '',
                  ...taskMetric,
                };
              })
              .filter(Boolean) as Array<{ key: string; providerKey: string; providerName: string; [k: string]: unknown }>;

            // Sort by provider name then model name
            taskDataSource.sort((a, b) => {
              const cmp = a.providerName.localeCompare(b.providerName);
              if (cmp !== 0) return cmp;
              return String(a.model).localeCompare(String(b.model));
            });

            // Build chart data from taskDataSource (exclude failed models)
            const chartData = providers
              .map((p) => {
                const taskMetric = metricsByProvider[p]?.find((m) => m.taskId === task.id);
                if (!taskMetric || taskMetric.successRate <= 0) return null;
                const ps = summary.providerSummaries[p];
                return {
                  providerKey: p,
                  label: `${ps?.provider || ''}/${ps?.model || ''}`,
                  metric: taskMetric,
                };
              })
              .filter(Boolean) as { providerKey: string; label: string; metric: TaskMetricPoint }[];

            return (
              <div key={task.id} className="p-4 rounded-md border border-border bg-bg-surface space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">#{index + 1}</span>
                    <span className="text-sm font-medium text-text-primary">{task.name}</span>
                  </div>
                  <span className="text-[10px] text-text-secondary">
                    {task.config.concurrency}c &times; {task.config.iterations}i &times; {task.config.maxTokens}t
                  </span>
                </div>

                <Table
                  columns={taskColumns}
                  dataSource={taskDataSource}
                  pagination={false}
                  size="small"
                />

                {/* Per-task metric comparison charts */}
                {chartData.length > 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="p-3 rounded border border-border/50 bg-bg-primary/50">
                      <MetricBarChart
                        label="Avg Response Time"
                        items={chartData.map((d) => ({ providerKey: d.providerKey, label: d.label, value: d.metric.avgResponseTime }))}
                        unit="ms"
                      />
                    </div>
                    <div className="p-3 rounded border border-border/50 bg-bg-primary/50">
                      <MetricBarChart
                        label="Tokens/s"
                        items={[...chartData]
                          .sort((a, b) => b.metric.avgTokensPerSecond - a.metric.avgTokensPerSecond)
                          .map((d) => ({ providerKey: d.providerKey, label: d.label, value: d.metric.avgTokensPerSecond }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-7 space-y-8"
    >
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
          <span>Duration: <span className="text-accent-blue">{formatDuration(summary.totalDuration)}</span></span>
          <span>Tokens: <span className="text-accent-violet">{formatNumber(summary.totalTokens)}</span></span>
          <span>Tasks: <span className="text-text-primary">{summary.completedTaskCount}/{summary.taskCount}</span></span>
          {summary.failedTaskCount > 0 && (
            <span>Failed: <span className="text-accent-rose">{summary.failedTaskCount}</span></span>
          )}
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

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabType)}
        items={tabItems}
        size="small"
      />
    </motion.div>
  );
}

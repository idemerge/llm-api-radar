import { useState } from 'react';
import { motion } from 'framer-motion';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Table, Tabs, Tag } from '../antdImports';
import { BenchmarkWorkflow, getProviderColor, TaskMetricPoint } from '../types';

interface WorkflowResultsProps {
  workflow: BenchmarkWorkflow | null;
  onExport?: (id: string, format: 'json' | 'csv') => void;
}

type TabType = 'overview' | 'tasks';

function formatNumber(n: number, decimals = 0): string {
  if (n == null || isNaN(n)) return '0';
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
function MetricBarChart({
  label,
  items,
  unit,
}: {
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
              <text
                x={labelWidth - 6}
                y={y + barHeight * 0.75}
                textAnchor="end"
                fill="rgba(255,255,255,0.5)"
                fontSize="8"
              >
                {item.label}
              </text>
              <rect x={labelWidth} y={y} width={barAreaWidth} height={barHeight} rx="2" fill="rgba(255,255,255,0.03)" />
              <rect x={labelWidth} y={y} width={barW} height={barHeight} rx="2" fill={color} opacity="0.75" />
              <text
                x={labelWidth + barAreaWidth + 4}
                y={y + barHeight * 0.75}
                fill="rgba(255,255,255,0.6)"
                fontSize="8"
              >
                {formatNumber(item.value)}
                {unit || ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Collapsible prompt preview */
function PromptPreview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const maxLen = 150;
  const truncated = text.length > maxLen;

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-text-secondary font-mono leading-relaxed whitespace-pre-wrap break-all">
        {open || !truncated ? text : text.slice(0, maxLen) + '...'}
      </p>
      {truncated && (
        <button
          onClick={() => setOpen(!open)}
          className="text-[10px] text-accent-blue hover:text-accent-blue/80 flex items-center gap-1"
        >
          {open ? <UpOutlined style={{ fontSize: 8 }} /> : <DownOutlined style={{ fontSize: 8 }} />}
          {open ? 'Show less' : 'Show full prompt'}
        </button>
      )}
    </div>
  );
}

/** Shared provider column definitions */
function providerColumns(hasP95: boolean) {
  const cols: Array<{
    title: string;
    dataIndex: string;
    key: string;
    align?: 'left' | 'right' | 'center';
    render?: (value: any, record: any) => any;
  }> = [
    {
      title: 'Provider',
      dataIndex: 'providerName',
      key: 'providerName',
      render: (name: string, record: { providerKey: string }) => (
        <span style={{ color: getProviderColor(record.providerKey), fontWeight: 500 }}>{name}</span>
      ),
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      render: (model: string, record: { providerKey: string }) => (
        <span style={{ color: getProviderColor(record.providerKey), opacity: 0.8 }} className="font-mono text-[12px]">
          {model}
        </span>
      ),
    },
    {
      title: 'Avg RT',
      dataIndex: 'avgResponseTime',
      key: 'avgResponseTime',
      align: 'right' as const,
      render: (val: number) => `${formatNumber(val)}ms`,
    },
  ];

  if (hasP95) {
    cols.push({
      title: 'P95 RT',
      dataIndex: 'p95ResponseTime',
      key: 'p95ResponseTime',
      align: 'right' as const,
      render: (val: number) => `${formatNumber(val)}ms`,
    });
  }

  cols.push(
    {
      title: 'TTFT',
      dataIndex: 'avgFirstTokenLatency',
      key: 'avgFirstTokenLatency',
      align: 'right' as const,
      render: (val: number) => (val > 0 ? `${formatNumber(val)}ms` : 'N/A'),
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
      dataIndex: hasP95 ? 'successRate' : 'overallSuccessRate',
      key: hasP95 ? 'successRate' : 'overallSuccessRate',
      align: 'right' as const,
      render: (val: number) => {
        const pct = val * 100;
        const color = pct >= 95 ? 'green' : pct >= 80 ? 'orange' : 'red';
        return <Tag color={color}>{pct.toFixed(1)}%</Tag>;
      },
    },
  );

  return cols;
}

/** Bar charts for a set of providers on a single task */
function TaskCharts({ chartData }: { chartData: { providerKey: string; label: string; metric: TaskMetricPoint }[] }) {
  if (chartData.length <= 1) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
      <div className="p-3 rounded border border-border/50 bg-bg-primary/50">
        <MetricBarChart
          label="Avg Response Time"
          items={chartData.map((d) => ({
            providerKey: d.providerKey,
            label: d.label,
            value: d.metric.avgResponseTime,
          }))}
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
  );
}

export function WorkflowResults({ workflow, onExport }: WorkflowResultsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (!workflow || !workflow.summary) return null;

  const { summary } = workflow;
  const providers = Object.keys(summary.providerSummaries);
  const completedTasks = workflow.tasks.filter((_, i) => workflow.taskResults[i]?.status === 'completed');
  const isSingleTask = completedTasks.length <= 1;

  // Build metrics by provider
  const metricsByProvider: Record<string, TaskMetricPoint[]> = {};
  for (const [provider, ps] of Object.entries(summary.providerSummaries)) {
    metricsByProvider[provider] = [...ps.perTaskMetrics].sort((a, b) => a.taskOrder - b.taskOrder);
  }

  const overviewDataSource = providers
    .map((p) => {
      const ps = summary.providerSummaries[p];
      return {
        ...ps,
        key: p,
        providerKey: p,
        providerName: ps.provider,
        model: ps.model,
      };
    })
    .sort((a, b) => {
      const cmp = a.providerName.localeCompare(b.providerName);
      if (cmp !== 0) return cmp;
      return a.model.localeCompare(b.model);
    });

  /** Build chart data for a specific task */
  function buildChartData(taskId: string) {
    return providers
      .map((p) => {
        const taskMetric = metricsByProvider[p]?.find((m) => m.taskId === taskId);
        if (!taskMetric || taskMetric.successRate <= 0) return null;
        const ps = summary.providerSummaries[p];
        return {
          providerKey: p,
          label: `${ps?.provider || ''}/${ps?.model || ''}`,
          metric: taskMetric,
        };
      })
      .filter(Boolean) as { providerKey: string; label: string; metric: TaskMetricPoint }[];
  }

  /** Build table data for a specific task */
  function buildTaskDataSource(taskId: string) {
    return providers
      .map((p) => {
        const taskMetric = metricsByProvider[p]?.find((m) => m.taskId === taskId);
        if (!taskMetric) return null;
        const ps = summary.providerSummaries[p];
        return {
          key: p,
          providerKey: p,
          providerName: ps?.provider || '',
          model: ps?.model || '',
          ...taskMetric,
          totalTokens: taskMetric.promptTokens,
        };
      })
      .filter(Boolean) as Array<{ key: string; providerKey: string; providerName: string; [k: string]: unknown }>;
  }

  // Single task: flat view with summary table + charts, no tabs
  if (isSingleTask) {
    const task = completedTasks[0];
    const taskDataSource = task ? buildTaskDataSource(task.id) : [];
    const chartData = task ? buildChartData(task.id) : [];

    // Sort
    taskDataSource.sort((a, b) => {
      const cmp = a.providerName.localeCompare(b.providerName);
      if (cmp !== 0) return cmp;
      return String(a.model).localeCompare(String(b.model));
    });

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-7 space-y-6">
        {/* Summary bar */}
        <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
          <span>
            Duration: <span className="text-accent-blue">{formatDuration(summary.totalDuration)}</span>
          </span>
          <span>
            Tokens: <span className="text-accent-violet">{formatNumber(summary.totalTokens)}</span>
          </span>
          <span>
            Tasks:{' '}
            <span className="text-text-primary">
              {summary.completedTaskCount}/{summary.taskCount}
            </span>
          </span>
          {summary.failedTaskCount > 0 && (
            <span>
              Failed: <span className="text-accent-rose">{summary.failedTaskCount}</span>
            </span>
          )}
        </div>

        {/* Provider comparison table */}
        <Table
          columns={providerColumns(true)}
          dataSource={taskDataSource.length > 0 ? taskDataSource : overviewDataSource}
          pagination={false}
          size="small"
        />

        {/* Bar charts */}
        <TaskCharts chartData={chartData} />

        {/* Prompt preview */}
        {task?.config?.prompt && (
          <div className="p-3 rounded border border-border/50 bg-bg-primary/50 space-y-1.5">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">Prompt</span>
            <PromptPreview text={task.config.prompt} />
            <div className="flex gap-3 text-[10px] text-text-tertiary font-mono">
              <span>Max tokens: {formatNumber(task.config.maxTokens)}</span>
              <span>Concurrency: {task.config.concurrency}</span>
              <span>Iterations: {task.config.iterations}</span>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // Multi-task: tabbed view
  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <Table columns={providerColumns(false)} dataSource={overviewDataSource} pagination={false} size="small" />
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

            const taskDataSource = buildTaskDataSource(task.id);
            taskDataSource.sort((a, b) => {
              const cmp = a.providerName.localeCompare(b.providerName);
              if (cmp !== 0) return cmp;
              return String(a.model).localeCompare(String(b.model));
            });

            const chartData = buildChartData(task.id);

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

                <Table columns={providerColumns(true)} dataSource={taskDataSource} pagination={false} size="small" />

                <TaskCharts chartData={chartData} />

                {/* Prompt preview */}
                {task.config?.prompt && (
                  <div className="p-3 rounded border border-border/50 bg-bg-primary/50 space-y-1.5">
                    <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">Prompt</span>
                    <PromptPreview text={task.config.prompt} />
                    <div className="flex gap-3 text-[10px] text-text-tertiary font-mono">
                      <span>Max tokens: {formatNumber(task.config.maxTokens)}</span>
                      <span>Concurrency: {task.config.concurrency}</span>
                      <span>Iterations: {task.config.iterations}</span>
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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-7 space-y-8">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
        <span>
          Duration: <span className="text-accent-blue">{formatDuration(summary.totalDuration)}</span>
        </span>
        <span>
          Tokens: <span className="text-accent-violet">{formatNumber(summary.totalTokens)}</span>
        </span>
        <span>
          Tasks:{' '}
          <span className="text-text-primary">
            {summary.completedTaskCount}/{summary.taskCount}
          </span>
        </span>
        {summary.failedTaskCount > 0 && (
          <span>
            Failed: <span className="text-accent-rose">{summary.failedTaskCount}</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as TabType)} items={tabItems} size="small" />
    </motion.div>
  );
}

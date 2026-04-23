import { useState } from 'react';
import { motion } from 'framer-motion';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Table, Tabs, Tag, Tooltip } from '../antdImports';
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

/** Column header with tooltip */
function tipTitle(label: string, tip: string) {
  return (
    <Tooltip title={tip}>
      <span className="cursor-help border-b border-dotted border-text-tertiary">{label}</span>
    </Tooltip>
  );
}

/** Shared provider column definitions */
function providerColumns(hasP95: boolean) {
  const cols: Array<{
    title: React.ReactNode;
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
      title: tipTitle('Avg RT', 'Average response time per request (milliseconds)'),
      dataIndex: 'avgResponseTime',
      key: 'avgResponseTime',
      align: 'right' as const,
      render: (val: number) => `${formatNumber(val)}ms`,
    },
  ];

  if (hasP95) {
    cols.push({
      title: tipTitle('P95 RT', '95th percentile response time — 95% of requests complete within this time'),
      dataIndex: 'p95ResponseTime',
      key: 'p95ResponseTime',
      align: 'right' as const,
      render: (val: number) => `${formatNumber(val)}ms`,
    });
  }

  cols.push(
    {
      title: tipTitle('TTFT', 'Time To First Token — how long until the first token arrives (streaming latency)'),
      dataIndex: 'avgFirstTokenLatency',
      key: 'avgFirstTokenLatency',
      align: 'right' as const,
      render: (val: number) => (val > 0 ? `${formatNumber(val)}ms` : 'N/A'),
    },
    {
      title: tipTitle('TPS', 'Tokens Per Second — average output speed of a single request'),
      dataIndex: 'avgTokensPerSecond',
      key: 'avgTokensPerSecond',
      align: 'right' as const,
      render: (val: number) => formatNumber(val),
    },
    {
      title: tipTitle(
        'In T/s',
        'Input Throughput — concurrency × avg input tokens per request / avg response time. Measures how fast the system processes input tokens',
      ),
      dataIndex: 'inputThroughput',
      key: 'inputThroughput',
      align: 'right' as const,
      render: (val: number) => (val > 0 ? formatNumber(val) : 'N/A'),
    },
    {
      title: tipTitle(
        'Out T/s',
        'Output Throughput — concurrency × avg output tokens per request / avg response time. Measures how fast the system generates output tokens',
      ),
      dataIndex: 'outputThroughput',
      key: 'outputThroughput',
      align: 'right' as const,
      render: (val: number) => (val > 0 ? formatNumber(val) : 'N/A'),
    },
    {
      title: tipTitle(
        'Total T/s',
        'Total Throughput — concurrency × avg total tokens per request / avg response time. Combined input + output token processing speed',
      ),
      dataIndex: 'totalThroughput',
      key: 'totalThroughput',
      align: 'right' as const,
      render: (val: number) => (val > 0 ? formatNumber(val) : 'N/A'),
    },
    {
      title: tipTitle('Tokens', 'Total tokens consumed across all iterations (input + output)'),
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      align: 'right' as const,
      render: (val: number) => formatNumber(val),
    },
    {
      title: tipTitle('Success', 'Percentage of requests that completed successfully without errors'),
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

    // Sort
    taskDataSource.sort((a, b) => {
      const cmp = a.providerName.localeCompare(b.providerName);
      if (cmp !== 0) return cmp;
      return String(a.model).localeCompare(String(b.model));
    });

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-7 space-y-6">
        {/* Provider comparison table */}

        {/* Provider comparison table */}
        <Table
          columns={providerColumns(true)}
          dataSource={taskDataSource.length > 0 ? taskDataSource : overviewDataSource}
          pagination={false}
          size="small"
        />

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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-7 space-y-6">
      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as TabType)} items={tabItems} size="small" />
    </motion.div>
  );
}

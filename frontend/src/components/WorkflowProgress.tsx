import { motion } from 'framer-motion';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { BenchmarkWorkflow } from '../types';
import { Progress, Tag, Timeline } from '../antdImports';
import type { TaskIterationProgress } from '../hooks/useWorkflow';

interface WorkflowProgressProps {
  workflow: BenchmarkWorkflow | null;
  taskProgress?: Record<string, TaskIterationProgress>;
}

function getStatusTagColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'processing';
    case 'failed':
      return 'error';
    case 'skipped':
      return 'default';
    default:
      return 'default';
  }
}

function getTimelineItemColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'running':
      return 'blue';
    case 'failed':
      return 'red';
    case 'skipped':
      return 'gray';
    default:
      return 'gray';
  }
}

function getTimelineDot(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircleOutlined style={{ fontSize: 14 }} />;
    case 'running':
      return <LoadingOutlined style={{ fontSize: 14 }} spin />;
    case 'failed':
      return <CloseCircleOutlined style={{ fontSize: 14 }} />;
    case 'skipped':
      return <MinusCircleOutlined style={{ fontSize: 14 }} />;
    default:
      return <ClockCircleOutlined style={{ fontSize: 14 }} />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function WorkflowProgress({ workflow, taskProgress }: WorkflowProgressProps) {
  if (!workflow) return null;

  const isRunning = workflow.status === 'running';
  const completedCount = workflow.taskResults.filter((r) => r.status === 'completed').length;
  const progress = workflow.tasks.length > 0 ? (completedCount / workflow.tasks.length) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-7 space-y-5">
      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            {completedCount} / {workflow.tasks.length} tasks completed
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress
          percent={Math.round(progress)}
          showInfo={false}
          strokeColor="#73bf69"
          railColor="rgba(255,255,255,0.06)"
          size="small"
        />
      </div>

      {/* Task Pipeline - using antd Timeline */}
      <div className="space-y-2">
        <label className="text-xs text-text-secondary uppercase tracking-wider font-medium">Task Pipeline</label>
        <Timeline
          items={workflow.tasks.map((task, index) => {
            const result = workflow.taskResults[index];
            const status = result?.status || 'pending';
            const isActive = status === 'running';
            const duration =
              result?.startedAt && result?.completedAt
                ? new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()
                : null;

            return {
              color: getTimelineItemColor(status),
              dot: getTimelineDot(status),
              children: (
                <div
                  className={`flex items-center gap-3 p-2.5 rounded border transition-all ${
                    isActive
                      ? 'border-accent-amber/20 bg-accent-amber/5'
                      : status === 'completed'
                        ? 'border-border bg-accent-teal/5'
                        : status === 'failed'
                          ? 'border-border bg-accent-rose/5'
                          : 'border-border bg-bg-surface'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isActive ? 'text-accent-amber' : 'text-text-primary'}`}>
                        {task.name}
                      </span>
                      <span className="text-[10px] text-text-secondary">
                        {task.config.concurrency}c × {task.config.iterations}i
                      </span>
                    </div>
                    {isActive &&
                      taskProgress?.[task.id] &&
                      taskProgress[task.id].total > 0 &&
                      (() => {
                        const p = taskProgress[task.id];
                        const pct = Math.round((p.completed / p.total) * 100);
                        return (
                          <div className="flex items-center gap-2 mt-1.5">
                            <Progress
                              percent={pct}
                              showInfo={false}
                              strokeColor="#f5a623"
                              railColor="rgba(255,255,255,0.06)"
                              size="small"
                              style={{ flex: 1, margin: 0 }}
                            />
                            <span className="text-[10px] text-accent-amber font-mono whitespace-nowrap">
                              {p.completed}/{p.total}
                            </span>
                          </div>
                        );
                      })()}
                    {result?.error && <p className="text-[10px] text-accent-rose mt-0.5 truncate">{result.error}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Tag
                      color={getStatusTagColor(status)}
                      style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}
                    >
                      {status === 'completed' && duration ? formatDuration(duration) : status}
                    </Tag>
                  </div>
                  {isActive && (
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full bg-accent-amber"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </div>
              ),
            };
          })}
        />
      </div>

      {/* Timing info */}
      {workflow.startedAt && (
        <div className="text-[10px] text-text-secondary flex gap-5">
          <span>Started: {formatDate(workflow.startedAt)}</span>
          {workflow.completedAt && (
            <span>
              Duration:{' '}
              {formatDuration(new Date(workflow.completedAt).getTime() - new Date(workflow.startedAt).getTime())}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

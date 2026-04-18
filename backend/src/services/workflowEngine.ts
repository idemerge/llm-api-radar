import { v4 as uuidv4 } from 'uuid';
import {
  BenchmarkWorkflow,
  WorkflowTaskResult,
  WorkflowSummary,
  WorkflowProviderSummary,
  TaskMetricPoint,
  SSEEvent,
} from '../types';
import { store } from './store';
import { workflowStore } from './workflowStore';
import { startBenchmark, subscribe, cancelRun } from './benchmarkEngine';
import { providerStore } from './providerStore';

type WorkflowEventCallback = (event: { type: string; data: unknown }) => void;

/** Resolve provider display name and model display name from a composite key like "configId:modelName" */
function resolveProviderInfo(providerKey: string): { providerName: string; modelName: string } {
  if (providerKey.includes(':')) {
    const [configId, modelId] = providerKey.split(':', 2);
    const config = providerStore.get(configId);
    if (config) {
      const modelCfg = config.models.find((m) => m.name === modelId);
      return {
        providerName: config.name,
        modelName: modelCfg?.displayName || modelCfg?.name || modelId,
      };
    }
    return { providerName: configId, modelName: modelId };
  }
  // Legacy keys
  const legacy: Record<string, string> = {
    openai: 'OpenAI',
    claude: 'Anthropic',
    gemini: 'Google',
    zai: 'ZhipuAI',
  };
  return { providerName: legacy[providerKey] || providerKey, modelName: providerKey };
}

const activeListeners: Map<string, Set<WorkflowEventCallback>> = new Map();
const cancelledWorkflows: Set<string> = new Set();

export function subscribeWorkflow(workflowId: string, callback: WorkflowEventCallback): () => void {
  if (!activeListeners.has(workflowId)) {
    activeListeners.set(workflowId, new Set());
  }
  activeListeners.get(workflowId)!.add(callback);

  return () => {
    const listeners = activeListeners.get(workflowId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        activeListeners.delete(workflowId);
      }
    }
  };
}

function emitWorkflow(workflowId: string, event: { type: string; data: unknown }): void {
  const listeners = activeListeners.get(workflowId);
  if (listeners) {
    listeners.forEach((cb) => cb(event));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cancelWorkflow(workflowId: string): boolean {
  if (cancelledWorkflows.has(workflowId)) return false;
  cancelledWorkflows.add(workflowId);
  return true;
}

export async function executeWorkflow(workflow: BenchmarkWorkflow, apiKeys: Record<string, string>): Promise<void> {
  workflow.status = 'running';
  workflow.startedAt = new Date().toISOString();
  workflowStore.update(workflow.id, workflow);

  emitWorkflow(workflow.id, {
    type: 'workflow:init',
    data: { workflow, currentTaskIndex: 0 },
  });

  for (let i = 0; i < workflow.tasks.length; i++) {
    const task = workflow.tasks[i];

    // Check cancellation
    if (cancelledWorkflows.has(workflow.id)) {
      markRemainingSkipped(workflow, i);
      workflow.status = 'cancelled';
      break;
    }

    // Emit task start
    emitWorkflow(workflow.id, {
      type: 'task:start',
      data: {
        taskId: task.id,
        taskName: task.name,
        taskOrder: i,
        totalTasks: workflow.tasks.length,
      },
    });

    // Update task result to running
    workflow.taskResults[i] = {
      taskId: task.id,
      taskName: task.name,
      benchmarkRunId: '',
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    workflowStore.update(workflow.id, { taskResults: workflow.taskResults });

    try {
      const providers = task.providers || workflow.providers;

      // Start a benchmark run for this task
      const benchmarkRun = await startBenchmark(providers, task.config, apiKeys);

      // Forward benchmark events as task:progress
      const unsubscribe = subscribe(benchmarkRun.id, (event: SSEEvent) => {
        emitWorkflow(workflow.id, {
          type: 'task:progress',
          data: { taskId: task.id, benchmarkRunId: benchmarkRun.id, ...event },
        });
      });

      // Wait for benchmark to complete
      await waitForBenchmarkComplete(benchmarkRun.id);
      unsubscribe();

      // Get the final run data
      const finalRun = store.get(benchmarkRun.id);

      if (finalRun && finalRun.status === 'completed') {
        workflow.taskResults[i] = {
          taskId: task.id,
          taskName: task.name,
          benchmarkRunId: benchmarkRun.id,
          status: 'completed',
          startedAt: workflow.taskResults[i].startedAt,
          completedAt: new Date().toISOString(),
        };

        emitWorkflow(workflow.id, {
          type: 'task:complete',
          data: {
            taskId: task.id,
            taskName: task.name,
            benchmarkRunId: benchmarkRun.id,
            summary: extractTaskSummary(finalRun),
          },
        });
      } else {
        throw new Error(finalRun?.status === 'failed' ? 'Benchmark run failed' : 'Benchmark run did not complete');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      workflow.taskResults[i] = {
        taskId: task.id,
        taskName: task.name,
        benchmarkRunId: '',
        status: 'failed',
        startedAt: workflow.taskResults[i]?.startedAt,
        completedAt: new Date().toISOString(),
        error: errorMsg,
      };

      emitWorkflow(workflow.id, {
        type: 'task:error',
        data: { taskId: task.id, taskName: task.name, error: errorMsg },
      });

      if (workflow.options.stopOnFailure) {
        markRemainingSkipped(workflow, i + 1);
        workflow.status = 'failed';
        break;
      }
    }

    workflowStore.update(workflow.id, { taskResults: workflow.taskResults });

    // Cooldown between tasks
    if (i < workflow.tasks.length - 1 && !cancelledWorkflows.has(workflow.id)) {
      const cooldown = workflow.options.cooldownBetweenTasks;
      if (cooldown > 0) {
        emitWorkflow(workflow.id, {
          type: 'cooldown',
          data: {
            nextTaskId: workflow.tasks[i + 1].id,
            remainingMs: cooldown,
          },
        });
        await sleep(cooldown);
      }
    }
  }

  // Generate summary
  workflow.summary = await generateSummary(workflow);
  if (workflow.status === 'running') {
    workflow.status = 'completed';
  }
  workflow.completedAt = new Date().toISOString();

  workflowStore.update(workflow.id, {
    status: workflow.status,
    taskResults: workflow.taskResults,
    summary: workflow.summary,
    completedAt: workflow.completedAt,
  });

  emitWorkflow(workflow.id, {
    type: 'workflow:complete',
    data: { workflowId: workflow.id, summary: workflow.summary, status: workflow.status },
  });

  // Cleanup
  cancelledWorkflows.delete(workflow.id);
  setTimeout(() => activeListeners.delete(workflow.id), 5000);
}

function waitForBenchmarkComplete(benchmarkId: string): Promise<void> {
  return new Promise((resolve) => {
    const run = store.get(benchmarkId);
    if (run && (run.status === 'completed' || run.status === 'failed')) {
      resolve();
      return;
    }

    const unsubscribe = subscribe(benchmarkId, (event: SSEEvent) => {
      if (event.type === 'done') {
        unsubscribe();
        resolve();
      }
    });
  });
}

function markRemainingSkipped(workflow: BenchmarkWorkflow, fromIndex: number): void {
  for (let j = fromIndex; j < workflow.tasks.length; j++) {
    workflow.taskResults[j] = {
      taskId: workflow.tasks[j].id,
      taskName: workflow.tasks[j].name,
      benchmarkRunId: '',
      status: 'skipped',
    };
  }
}

function extractTaskSummary(run: any): Record<string, any> {
  const summaries: Record<string, any> = {};
  for (const [provider, result] of Object.entries(run.results as Record<string, any>)) {
    summaries[provider] = {
      avgResponseTime: result.summary.avgResponseTime,
      p95ResponseTime: result.summary.p95ResponseTime,
      avgTokensPerSecond: result.summary.avgTokensPerSecond,
      successRate: result.summary.successRate,
      estimatedCost: result.summary.estimatedCost,
    };
  }
  return summaries;
}

async function generateSummary(workflow: BenchmarkWorkflow): Promise<WorkflowSummary> {
  const completedResults = workflow.taskResults.filter((r) => r.status === 'completed');
  const providerSummaries: Record<string, WorkflowProviderSummary> = {};

  let totalCost = 0;
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const taskResult of completedResults) {
    const run = store.get(taskResult.benchmarkRunId);
    if (!run) continue;

    const task = workflow.tasks.find((t) => t.id === taskResult.taskId);
    if (!task) continue;

    for (const [providerName, result] of Object.entries(run.results)) {
      if (!providerSummaries[providerName]) {
        const info = resolveProviderInfo(providerName);
        providerSummaries[providerName] = {
          provider: info.providerName,
          model: info.modelName,
          avgResponseTime: 0,
          avgFirstTokenLatency: 0,
          avgTokensPerSecond: 0,
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCost: 0,
          overallSuccessRate: 0,
          perTaskMetrics: [],
        };
      }

      const metric: TaskMetricPoint = {
        taskId: task.id,
        taskName: task.name,
        taskOrder: task.order,
        concurrency: task.config.concurrency,
        promptTokens: result.summary.totalTokens,
        inputTokens: result.summary.totalInputTokens || 0,
        outputTokens: result.summary.totalOutputTokens || 0,
        avgResponseTime: result.summary.avgResponseTime,
        p95ResponseTime: result.summary.p95ResponseTime,
        avgFirstTokenLatency: result.summary.avgFirstTokenLatency,
        avgTokensPerSecond: result.summary.avgTokensPerSecond,
        systemThroughput: result.summary.systemThroughput || 0,
        successRate: result.summary.successRate,
        estimatedCost: result.summary.estimatedCost,
      };

      providerSummaries[providerName].perTaskMetrics.push(metric);
      totalCost += result.summary.estimatedCost;
      totalTokens += result.summary.totalTokens;
      totalInputTokens += result.summary.totalInputTokens || 0;
      totalOutputTokens += result.summary.totalOutputTokens || 0;
    }
  }

  // Calculate cross-task averages
  for (const summary of Object.values(providerSummaries)) {
    const metrics = summary.perTaskMetrics;
    if (metrics.length === 0) continue;

    summary.avgResponseTime = Math.round(metrics.reduce((a, m) => a + m.avgResponseTime, 0) / metrics.length);
    summary.avgFirstTokenLatency = Math.round(metrics.reduce((a, m) => a + m.avgFirstTokenLatency, 0) / metrics.length);
    summary.avgTokensPerSecond = Math.round(metrics.reduce((a, m) => a + m.avgTokensPerSecond, 0) / metrics.length);
    summary.totalTokens = metrics.reduce((a, m) => a + m.promptTokens, 0);
    summary.totalInputTokens = metrics.reduce((a, m) => a + m.inputTokens, 0);
    summary.totalOutputTokens = metrics.reduce((a, m) => a + m.outputTokens, 0);
    summary.totalCost = Number(metrics.reduce((a, m) => a + m.estimatedCost, 0).toFixed(6));
    summary.overallSuccessRate = Number((metrics.reduce((a, m) => a + m.successRate, 0) / metrics.length).toFixed(4));
  }

  const startTime = workflow.startedAt ? new Date(workflow.startedAt).getTime() : Date.now();
  const endTime = Date.now();

  return {
    totalDuration: endTime - startTime,
    totalCost: Number(totalCost.toFixed(6)),
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    taskCount: workflow.tasks.length,
    completedTaskCount: completedResults.length,
    failedTaskCount: workflow.taskResults.filter((r) => r.status === 'failed').length,
    providerSummaries,
  };
}

/**
 * Backfill totalInputTokens/totalOutputTokens for workflows whose summary
 * was generated before these fields were added. Computes from iteration data.
 */
export function backfillTokenStats(workflow: BenchmarkWorkflow): BenchmarkWorkflow {
  if (!workflow.summary) return workflow;
  if (workflow.summary.totalInputTokens != null && workflow.summary.totalInputTokens > 0) return workflow;

  const completedResults = workflow.taskResults.filter((r) => r.status === 'completed');
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const taskResult of completedResults) {
    const run = store.get(taskResult.benchmarkRunId);
    if (!run) continue;

    for (const [providerName, result] of Object.entries(run.results)) {
      const provInput = result.iterations.reduce((a, it) => a + (it.inputTokens || 0), 0);
      const provOutput = result.iterations.reduce((a, it) => a + (it.outputTokens || 0), 0);

      // Backfill provider summary
      const ps = workflow.summary!.providerSummaries[providerName];
      if (ps) {
        if (!ps.totalInputTokens) ps.totalInputTokens = 0;
        if (!ps.totalOutputTokens) ps.totalOutputTokens = 0;
        ps.totalInputTokens += provInput;
        ps.totalOutputTokens += provOutput;

        // Backfill per-task metrics
        const taskMetric = ps.perTaskMetrics.find((m) => m.taskId === taskResult.taskId);
        if (taskMetric) {
          if (!taskMetric.inputTokens) taskMetric.inputTokens = provInput;
          if (!taskMetric.outputTokens) taskMetric.outputTokens = provOutput;
        }
      }

      totalInputTokens += provInput;
      totalOutputTokens += provOutput;
    }
  }

  workflow.summary!.totalInputTokens = totalInputTokens;
  workflow.summary!.totalOutputTokens = totalOutputTokens;

  // Persist the backfilled data
  workflowStore.update(workflow.id, { summary: workflow.summary });

  return workflow;
}

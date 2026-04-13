import { v4 as uuidv4 } from 'uuid';
import {
  BenchmarkConfig,
  BenchmarkRun,
  ErrorCategory,
  ImageInput,
  IterationResult,
  LLMProvider,
  ProviderResult,
  ProviderSummary,
  SSEEvent,
} from '../types';
import { store } from './store';
import { testCapabilities } from './capabilityTester';
import { OpenAIProvider } from '../providers/openai';
import { ClaudeProvider } from '../providers/claude';
import { GeminiProvider } from '../providers/gemini';
import { ZaiProvider } from '../providers/zai';
import { createDynamicProvider } from '../providers/adapter';
import { providerStore } from './providerStore';

const legacyProviders: Record<string, LLMProvider> = {
  openai: new OpenAIProvider(),
  claude: new ClaudeProvider(),
  gemini: new GeminiProvider(),
  zai: new ZaiProvider(),
};

// Resolve a provider name to an LLMProvider instance
// Supports: legacy IDs (openai, claude, etc.), configId:modelName, or bare configId
function resolveProvider(providerName: string, _apiKey: string): LLMProvider | null {
  // Try legacy providers first
  if (legacyProviders[providerName]) {
    return legacyProviders[providerName];
  }

  // Try configId:modelName format
  if (providerName.includes(':')) {
    const [configId, modelName] = providerName.split(':', 2);
    const dp = createDynamicProvider(configId, modelName);
    if (dp) return dp;
  }

  // Try as a bare config ID — use first active model
  const config = providerStore.get(providerName);
  if (config) {
    const activeModel = config.models.find((m) => m.isActive !== false);
    if (activeModel) {
      const dp = createDynamicProvider(providerName, activeModel.name);
      if (dp) return dp;
    }
  }

  return null;
}

type EventCallback = (event: SSEEvent) => void;

const activeListeners: Map<string, Set<EventCallback>> = new Map();
const cancelledRuns: Set<string> = new Set();

export function isCancelled(benchmarkId: string): boolean {
  return cancelledRuns.has(benchmarkId);
}

export function cancelRun(benchmarkId: string): boolean {
  if (cancelledRuns.has(benchmarkId)) {
    return false;
  }
  cancelledRuns.add(benchmarkId);
  emit(benchmarkId, { type: 'error', data: { message: 'Benchmark cancelled by user' } });
  return true;
}

export function subscribe(benchmarkId: string, callback: EventCallback): () => void {
  if (!activeListeners.has(benchmarkId)) {
    activeListeners.set(benchmarkId, new Set());
  }
  activeListeners.get(benchmarkId)!.add(callback);

  return () => {
    const listeners = activeListeners.get(benchmarkId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        activeListeners.delete(benchmarkId);
      }
    }
  };
}

function emit(benchmarkId: string, event: SSEEvent): void {
  const listeners = activeListeners.get(benchmarkId);
  if (listeners) {
    listeners.forEach((cb) => cb(event));
  }
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Classify errors into categories for better analysis
function classifyError(error: unknown): ErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('timeout') || message.includes('aborted') || message.includes('timed out')) {
    return 'timeout';
  }
  if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
    return 'rate_limit';
  }
  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('dns')
  ) {
    return 'network';
  }
  if (message.includes('api') || message.includes('401') || message.includes('403') || message.includes('500')) {
    return 'api_error';
  }
  return 'unknown';
}

// Sleep utility with cancellation support
function sleep(ms: number, benchmarkId: string): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Check cancellation every 100ms for responsiveness
    const check = setInterval(() => {
      if (isCancelled(benchmarkId)) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(check);
    }, ms + 10);
  });
}

// Exponential backoff retry
async function executeWithRetry(
  provider: LLMProvider,
  prompt: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  apiKey: string,
  streaming: boolean | undefined,
  images: ImageInput[] | undefined,
  maxRetries: number = 2,
): Promise<{ response: ReturnType<LLMProvider['execute']> extends Promise<infer R> ? R : never; retries: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await provider.execute(prompt, systemPrompt, maxTokens, apiKey, streaming, images);
      return { response, retries: attempt };
    } catch (error) {
      lastError = error;
      const category = classifyError(error);
      // Only retry on rate_limit and network errors
      if (attempt < maxRetries && (category === 'rate_limit' || category === 'network')) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function calculateSummary(iterations: IterationResult[], totalTestDurationMs?: number): ProviderSummary {
  const successful = iterations.filter((i) => i.success);
  const responseTimes = successful.map((i) => i.responseTime);
  const firstTokenLatencies = successful.map((i) => i.firstTokenLatency);

  if (successful.length === 0) {
    const errorBreakdown = buildErrorBreakdown(iterations);
    return {
      avgResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      avgTokensPerSecond: 0,
      avgFirstTokenLatency: 0,
      p50FirstTokenLatency: 0,
      p95FirstTokenLatency: 0,
      p99FirstTokenLatency: 0,
      totalTokens: 0,
      estimatedCost: 0,
      successRate: 0,
      errorCount: iterations.length,
      errorBreakdown,
      totalTestDuration: totalTestDurationMs,
    };
  }

  // System throughput: use total test duration for more accurate measurement
  const totalOutputTokens = successful.reduce((a, b) => a + b.outputTokens, 0);
  let systemThroughput: number;
  if (totalTestDurationMs && totalTestDurationMs > 0) {
    // Total output tokens / total wall-clock time
    systemThroughput = Math.round((totalOutputTokens * 1000) / totalTestDurationMs);
  } else {
    // Fallback: use max response time in the batch
    const batchMaxTime = Math.max(...responseTimes);
    systemThroughput = batchMaxTime > 0 ? Math.round((totalOutputTokens * 1000) / batchMaxTime) : 0;
  }

  const errorBreakdown = buildErrorBreakdown(iterations);

  return {
    avgResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
    p50ResponseTime: Math.round(calculatePercentile(responseTimes, 50)),
    p95ResponseTime: Math.round(calculatePercentile(responseTimes, 95)),
    p99ResponseTime: Math.round(calculatePercentile(responseTimes, 99)),
    avgTokensPerSecond: Math.round(successful.reduce((a, b) => a + b.tokensPerSecond, 0) / successful.length),
    avgFirstTokenLatency: Math.round(firstTokenLatencies.reduce((a, b) => a + b, 0) / firstTokenLatencies.length),
    p50FirstTokenLatency: Math.round(calculatePercentile(firstTokenLatencies, 50)),
    p95FirstTokenLatency: Math.round(calculatePercentile(firstTokenLatencies, 95)),
    p99FirstTokenLatency: Math.round(calculatePercentile(firstTokenLatencies, 99)),
    totalTokens: iterations.reduce((a, b) => a + b.totalTokens, 0),
    estimatedCost: Number(iterations.reduce((a, b) => a + b.estimatedCost, 0).toFixed(6)),
    successRate: successful.length / iterations.length,
    errorCount: iterations.length - successful.length,
    systemThroughput,
    errorBreakdown,
    totalTestDuration: totalTestDurationMs,
  };
}

function buildErrorBreakdown(iterations: IterationResult[]): Record<ErrorCategory, number> {
  const breakdown: Record<ErrorCategory, number> = {
    timeout: 0,
    rate_limit: 0,
    api_error: 0,
    network: 0,
    unknown: 0,
  };
  iterations
    .filter((i) => !i.success && i.errorCategory)
    .forEach((i) => {
      breakdown[i.errorCategory!]++;
    });
  return breakdown;
}

async function runProviderBenchmark(
  benchmarkId: string,
  providerName: string,
  config: BenchmarkConfig,
  apiKey: string,
): Promise<ProviderResult> {
  const provider = resolveProvider(providerName, apiKey);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const iterations: IterationResult[] = [];
  const { concurrency, iterations: totalIterations } = config;
  const warmupRuns = config.warmupRuns ?? 0;
  const requestInterval = config.requestInterval ?? 0;
  const randomizeInterval = config.randomizeInterval ?? false;

  // === Warmup Phase ===
  if (warmupRuns > 0) {
    emit(benchmarkId, {
      type: 'progress',
      data: {
        provider: providerName,
        phase: 'warmup',
        completed: 0,
        total: warmupRuns,
      },
    });

    for (let w = 0; w < warmupRuns; w++) {
      if (isCancelled(benchmarkId)) {
        throw new Error('Benchmark cancelled by user');
      }
      try {
        await provider.execute(
          config.prompt,
          config.systemPrompt,
          config.maxTokens,
          apiKey,
          config.streaming,
          config.images,
        );
      } catch {
        // Warmup errors are silently ignored
      }

      emit(benchmarkId, {
        type: 'progress',
        data: {
          provider: providerName,
          phase: 'warmup',
          completed: w + 1,
          total: warmupRuns,
        },
      });
    }
  }

  // === Main Test Phase ===
  const testStartTime = Date.now();

  for (let i = 0; i < totalIterations; i += concurrency) {
    if (isCancelled(benchmarkId)) {
      throw new Error('Benchmark cancelled by user');
    }

    // Request interval between batches (skip before first batch)
    if (i > 0 && requestInterval > 0) {
      const interval = randomizeInterval ? Math.round(requestInterval * (0.5 + Math.random())) : requestInterval;
      await sleep(interval, benchmarkId);
      if (isCancelled(benchmarkId)) {
        throw new Error('Benchmark cancelled by user');
      }
    }

    const batchSize = Math.min(concurrency, totalIterations - i);
    const batch = Array.from({ length: batchSize }, (_, j) => i + j);

    const batchResults = await Promise.all(
      batch.map(async (iterIndex) => {
        try {
          const { response } = await executeWithRetry(
            provider,
            config.prompt,
            config.systemPrompt,
            config.maxTokens,
            apiKey,
            config.streaming,
            config.images,
          );

          const result: IterationResult = {
            iteration: iterIndex + 1,
            responseTime: response.responseTime,
            firstTokenLatency: response.firstTokenLatency,
            tokensPerSecond: Math.round((response.outputTokens / response.responseTime) * 1000),
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            reasoningTokens: response.reasoningTokens,
            totalTokens: response.totalTokens,
            estimatedCost: response.estimatedCost,
            success: true,
          };

          return result;
        } catch (error) {
          const errorCategory = classifyError(error);
          return {
            iteration: iterIndex + 1,
            responseTime: 0,
            firstTokenLatency: 0,
            tokensPerSecond: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCategory,
          } as IterationResult;
        }
      }),
    );

    iterations.push(...batchResults);

    emit(benchmarkId, {
      type: 'progress',
      data: {
        provider: providerName,
        phase: 'testing',
        completed: iterations.length,
        total: totalIterations,
        latestResults: batchResults,
      },
    });
  }

  const totalTestDuration = Date.now() - testStartTime;

  // Determine model name — for dynamic providers, extract from provider name or provider key
  let model: string;
  if (providerName.includes(':')) {
    model = providerName.split(':', 2)[1];
  } else {
    model =
      providerName === 'openai'
        ? 'gpt-4'
        : providerName === 'claude'
          ? 'claude-3-sonnet'
          : providerName === 'gemini'
            ? 'gemini-pro'
            : providerName === 'zai'
              ? 'glm-4.7'
              : provider.name || 'unknown';
  }

  const result: ProviderResult = {
    provider: providerName,
    model,
    iterations,
    summary: calculateSummary(iterations, totalTestDuration),
  };

  emit(benchmarkId, {
    type: 'complete',
    data: { provider: providerName, summary: result.summary },
  });

  return result;
}

export async function startBenchmark(
  providerNames: string[],
  config: BenchmarkConfig,
  apiKeys: Record<string, string>,
): Promise<BenchmarkRun> {
  const id = `bench_${uuidv4().slice(0, 8)}`;

  const run: BenchmarkRun = {
    id,
    status: 'running',
    providers: providerNames,
    config,
    results: {},
    createdAt: new Date().toISOString(),
  };

  store.create(run);

  const providerPromises = providerNames.map(async (name) => {
    try {
      const result = await runProviderBenchmark(id, name, config, apiKeys[name] || '');
      run.results[name] = result;
    } catch (error) {
      emit(id, {
        type: 'error',
        data: {
          provider: name,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  });

  Promise.all(providerPromises).then(async () => {
    if (isCancelled(id)) {
      run.status = 'failed';
      run.completedAt = new Date().toISOString();
      store.update(id, run);
      emit(id, { type: 'done', data: { id, cancelled: true } });
      cancelledRuns.delete(id);
      return;
    }

    try {
      const testProvider = providerNames.find((name) => apiKeys[name]);
      if (testProvider) {
        run.capabilityTests = await testCapabilities(testProvider, apiKeys[testProvider]);
      }
    } catch (err) {
      console.error('Capability tests failed:', err);
    }

    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    store.update(id, run);
    emit(id, { type: 'done', data: { id } });
  });

  return run;
}

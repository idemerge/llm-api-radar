import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
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
  LEGACY_PROVIDER_IDS,
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

// ── Token Bucket (per-benchmark, lazy-refill) ────────────────────────────────
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly intervalMs: number;

  constructor(maxQps: number) {
    this.intervalMs = 1000 / maxQps;
    this.tokens = 1; // pre-charge one token so the first request is immediate
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed / this.intervalMs;
    if (newTokens >= 1) {
      // Advance lastRefill by whole intervals only, preserving fractional progress
      const wholeIntervals = Math.floor(newTokens);
      this.lastRefill += wholeIntervals * this.intervalMs;
      this.tokens = Math.min(1, this.tokens + wholeIntervals);
    }
  }

  tryAcquire(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0; // got a token immediately
    }
    // Time until next token is available
    return this.intervalMs - (Date.now() - this.lastRefill);
  }
}

const tokenBuckets: Map<string, TokenBucket> = new Map();

async function acquireToken(benchmarkId: string, maxQps: number): Promise<void> {
  if (!maxQps || maxQps <= 0) return;
  if (!tokenBuckets.has(benchmarkId)) {
    tokenBuckets.set(benchmarkId, new TokenBucket(maxQps));
  }
  const bucket = tokenBuckets.get(benchmarkId)!;
  while (true) {
    const waitMs = bucket.tryAcquire();
    if (waitMs <= 0) return;
    if (isCancelled(benchmarkId)) return;
    await sleep(Math.ceil(waitMs), benchmarkId);
    if (isCancelled(benchmarkId)) return;
  }
}

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

// Generate a random prefix sized to the prompt to bust KV-cache blocks.
// The prefix scales with input size: ~5% of prompt length, clamped to
// [128 chars, 4096 chars] (~32–1024 tokens). Uses base62 characters with
// spaces every 4-6 chars to form realistic token boundaries.
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateRandomPrefix(promptLength: number): string {
  const targetChars = Math.min(4096, Math.max(128, Math.round(promptLength * 0.05)));
  const bytes = randomBytes(targetChars);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += BASE62[bytes[i] % 62];
    if (i > 0 && i % (4 + (bytes[i] % 3)) === 0) result += ' ';
  }
  return result;
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
  const maybeProvider = resolveProvider(providerName, apiKey);
  if (!maybeProvider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  const provider: LLMProvider = maybeProvider;

  const iterations: IterationResult[] = [];
  const { concurrency, iterations: totalIterations } = config;
  const warmupRuns = config.warmupRuns ?? 0;
  const requestInterval = config.requestInterval ?? 0;
  const randomizeInterval = config.randomizeInterval ?? false;
  const maxQps = config.maxQps ?? 0;

  // Build random-prefix schedule for cache hit rate control.
  // Each request independently rolls: P(new prefix) = 1 − rate,
  // P(reuse existing) = rate. Reuse picks from a sliding window of
  // the most recent prefixes (sized to concurrency) so the chosen
  // prefix is still likely warm in the inference engine's KV cache
  // (SGLang/vLLM evict old entries under memory pressure).
  //
  // Prefix size adapts to prompt length (~5%, clamped 128–4096 chars)
  // so short prompts aren't bloated while long prompts still bust
  // block-level KV cache reliably.
  let variantSchedule: string[] | null = null;
  if (config.targetCacheHitRate !== undefined && config.targetCacheHitRate < 1) {
    const schedule: string[] = [];
    const pool: string[] = [];
    const promptLen = config.prompt.length;
    // Window size: at least concurrency so concurrent requests can
    // all reference warm prefixes, capped to avoid picking stale entries.
    const windowSize = Math.max(5, concurrency);

    for (let i = 0; i < totalIterations; i++) {
      if (pool.length === 0 || Math.random() >= config.targetCacheHitRate) {
        // New unique prefix → cache miss when first executed
        const p = generateRandomPrefix(promptLen);
        pool.push(p);
        schedule.push(p);
      } else {
        // Reuse a recent prefix → likely still in KV cache
        const windowStart = Math.max(0, pool.length - windowSize);
        const idx = windowStart + Math.floor(Math.random() * (pool.length - windowStart));
        schedule.push(pool[idx]);
      }
    }
    variantSchedule = schedule;
  }

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
        const warmupPrompt = variantSchedule
          ? `${variantSchedule[w % variantSchedule.length]}\n${config.prompt}`
          : config.prompt;
        await provider.execute(
          warmupPrompt,
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

  let nextIndex = 0;
  let completedCount = 0;

  async function worker(): Promise<void> {
    while (true) {
      // Claim the next iteration index (atomic in JS single-threaded event loop)
      const iterIndex = nextIndex;
      if (iterIndex >= totalIterations) break;
      nextIndex++;

      if (isCancelled(benchmarkId)) return;

      // Token bucket rate limiting
      await acquireToken(benchmarkId, maxQps);
      if (isCancelled(benchmarkId)) return;

      let result: IterationResult;
      try {
        const effectivePrompt = variantSchedule ? `${variantSchedule[iterIndex]}\n${config.prompt}` : config.prompt;

        const { response } = await executeWithRetry(
          provider,
          effectivePrompt,
          config.systemPrompt,
          config.maxTokens,
          apiKey,
          config.streaming,
          config.images,
        );

        result = {
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
      } catch (error) {
        const errorCategory = classifyError(error);
        result = {
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
        };
      }

      iterations.push(result);
      completedCount++;

      // Per-request progress event
      emit(benchmarkId, {
        type: 'progress',
        data: {
          provider: providerName,
          phase: 'testing',
          completed: completedCount,
          total: totalIterations,
          latestResults: [result],
        },
      });

      // Per-request interval (applied after completing a request, before starting the next)
      if (requestInterval > 0) {
        const interval = randomizeInterval ? Math.round(requestInterval * (0.5 + Math.random())) : requestInterval;
        await sleep(interval, benchmarkId);
        if (isCancelled(benchmarkId)) return;
      }
    }
  }

  // Spawn `concurrency` workers to maintain steady in-flight request count
  const workerCount = Math.min(concurrency, totalIterations);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (isCancelled(benchmarkId)) {
    throw new Error('Benchmark cancelled by user');
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

  Promise.all(providerPromises)
    .then(async () => {
      if (isCancelled(id)) {
        run.status = 'failed';
        run.completedAt = new Date().toISOString();
        store.update(id, run);
        emit(id, { type: 'done', data: { id, cancelled: true } });
        cancelledRuns.delete(id);
        tokenBuckets.delete(id);
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
      cancelledRuns.delete(id);
      tokenBuckets.delete(id);
      emit(id, { type: 'done', data: { id } });
    })
    .catch((err) => {
      console.error('Benchmark completion error:', err);
      cancelledRuns.delete(id);
      tokenBuckets.delete(id);
      run.status = 'failed';
      run.completedAt = new Date().toISOString();
      try {
        store.update(id, run);
      } catch (storeErr) {
        console.error('Failed to update failed benchmark:', storeErr);
      }
      emit(id, { type: 'done', data: { id, error: 'Internal error' } });
    });

  return run;
}

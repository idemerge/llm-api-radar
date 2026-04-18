export const LEGACY_PROVIDER_IDS = ['openai', 'claude', 'gemini', 'zai'] as const;

export interface ImageInput {
  type: 'url' | 'base64';
  url?: string;
  mediaType?: string;
  data?: string;
}

export interface BenchmarkConfig {
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  concurrency: number;
  iterations: number;
  streaming?: boolean;
  warmupRuns?: number;
  requestInterval?: number;
  randomizeInterval?: boolean;
  maxQps?: number;
  images?: ImageInput[];
  targetCacheHitRate?: number; // 0.0–1.0; injects UUID prefix per request to control prefix-cache hit rate
}

export interface CapabilityTest {
  type: 'vision' | 'function_calling' | 'json_mode' | 'streaming' | 'non_streaming';
  name: string;
  description: string;
  passed: boolean;
  details?: string;
  latencyMs?: number;
}

export type ErrorCategory = 'timeout' | 'rate_limit' | 'api_error' | 'network' | 'unknown';

export interface IterationResult {
  iteration: number;
  responseTime: number;
  firstTokenLatency: number;
  tokensPerSecond: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCost: number;
  success: boolean;
  error?: string;
  errorCategory?: ErrorCategory;
}

export interface ProviderSummary {
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  avgTokensPerSecond: number;
  avgFirstTokenLatency: number;
  p50FirstTokenLatency: number;
  p95FirstTokenLatency: number;
  p99FirstTokenLatency: number;
  totalTokens: number;
  estimatedCost: number;
  successRate: number;
  errorCount: number;
  systemThroughput?: number;
  errorBreakdown?: Record<ErrorCategory, number>;
  totalTestDuration?: number;
}

export interface ProviderResult {
  provider: string;
  model: string;
  iterations: IterationResult[];
  summary: ProviderSummary;
}

export type BenchmarkStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BenchmarkRun {
  id: string;
  status: BenchmarkStatus;
  providers: string[];
  config: BenchmarkConfig;
  results: Record<string, ProviderResult>;
  capabilityTests?: CapabilityTest[];
  createdAt: string;
  completedAt?: string;
}

export interface StartBenchmarkRequest {
  providers: string[];
  config: BenchmarkConfig;
  apiKeys: Record<string, string>;
}

export interface SSEEvent {
  type: 'progress' | 'complete' | 'error' | 'done';
  data: unknown;
}

export interface LLMProvider {
  name: string;
  execute(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    streaming?: boolean,
    images?: ImageInput[],
  ): Promise<LLMResponse>;
}

export interface CompletionTokensDetails {
  reasoningTokens: number;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  responseTime: number;
  firstTokenLatency: number;
  estimatedCost: number;
  model: string;
  completionTokensDetails?: CompletionTokensDetails;
}

// ==================== Workflow Types ====================

export type WorkflowStatus = 'draft' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WorkflowTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowTask {
  id: string;
  name: string;
  description?: string;
  order: number;
  config: BenchmarkConfig;
  providers?: string[];
  tags?: Record<string, string>;
}

export interface WorkflowTaskResult {
  taskId: string;
  taskName: string;
  benchmarkRunId: string;
  status: WorkflowTaskStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface BenchmarkWorkflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  providers: string[];
  providerLabels?: Record<string, string>;
  apiKeys?: Record<string, string>;
  tasks: WorkflowTask[];
  options: WorkflowOptions;
  taskResults: WorkflowTaskResult[];
  summary?: WorkflowSummary;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowOptions {
  executionMode: 'sequential';
  stopOnFailure: boolean;
  cooldownBetweenTasks: number;
}

export interface WorkflowSummary {
  totalDuration: number;
  totalCost: number;
  totalTokens: number;
  taskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  providerSummaries: Record<string, WorkflowProviderSummary>;
}

export interface WorkflowProviderSummary {
  provider: string;
  model: string;
  avgResponseTime: number;
  avgFirstTokenLatency: number;
  avgTokensPerSecond: number;
  totalTokens: number;
  totalCost: number;
  overallSuccessRate: number;
  perTaskMetrics: TaskMetricPoint[];
}

export interface TaskMetricPoint {
  taskId: string;
  taskName: string;
  taskOrder: number;
  concurrency: number;
  promptTokens: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  avgFirstTokenLatency: number;
  avgTokensPerSecond: number;
  systemThroughput: number;
  successRate: number;
  estimatedCost: number;
}

// ==================== Provider Config Types ====================

export type ProviderFormat = 'openai' | 'anthropic' | 'gemini' | 'custom';

export interface ModelConfig {
  id: string;
  name: string;
  displayName?: string;
  contextSize: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  isActive: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string; // encrypted at rest
  format: ProviderFormat;
  models: ModelConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfigInput {
  name: string;
  endpoint: string;
  apiKey: string;
  format: ProviderFormat;
  models: ModelConfig[];
}

export interface ProviderConfigResponse {
  id: string;
  name: string;
  endpoint: string;
  apiKeyMasked: string;
  format: ProviderFormat;
  models: ModelConfig[];
  createdAt: string;
  updatedAt: string;
}

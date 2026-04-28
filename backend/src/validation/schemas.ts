import { z, ZodSchema } from 'zod';

// Auth schemas
export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

// Benchmark schemas
export const StartBenchmarkSchema = z.object({
  providers: z.array(z.string().min(1)).min(1, 'At least one provider is required'),
  config: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    systemPrompt: z.string().optional(),
    maxTokens: z.number().int().min(1).max(1000000),
    concurrency: z.number().int().min(1).max(5000),
    iterations: z.number().int().min(1).max(10000000),
    streaming: z.boolean().optional(),
    warmupRuns: z.number().int().min(0).max(5).optional(),
    requestInterval: z.number().int().min(0).optional(),
    randomizeInterval: z.boolean().optional(),
    maxQps: z.number().min(0).max(1000).optional(),
    targetCacheHitRate: z.number().min(0).max(1).optional(),
    images: z
      .array(
        z.object({
          type: z.enum(['url', 'base64']),
          url: z.string().optional(),
          mediaType: z.string().optional(),
          data: z.string().optional(),
        }),
      )
      .optional(),
  }),
  apiKeys: z.record(z.string(), z.string()).optional().default({}),
});

// Provider schemas
const ModelConfigSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1, 'Model name is required'),
  displayName: z.string().optional(),
  contextSize: z.number().int().min(1),
  supportsVision: z.boolean(),
  supportsTools: z.boolean(),
  supportsStreaming: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const ProviderConfigInputSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  endpoint: z.string().min(1, 'Endpoint URL is required'),
  apiKey: z.string().min(1, 'API key is required'),
  format: z.enum(['openai', 'anthropic', 'gemini', 'custom']),
  models: z.array(ModelConfigSchema).min(1, 'At least one model is required'),
});

// Partial schema for updates — all fields optional except models (when provided must be non-empty)
export const ProviderConfigUpdateSchema = z.object({
  name: z.string().min(1, 'Provider name is required').optional(),
  endpoint: z.string().min(1, 'Endpoint URL is required').optional(),
  apiKey: z.string().min(1, 'API key is required').optional(),
  format: z.enum(['openai', 'anthropic', 'gemini', 'custom']).optional(),
  models: z.array(ModelConfigSchema).min(1, 'At least one model is required').optional(),
});

export const TestConnectionSchema = z.object({
  endpoint: z.string().min(1, 'Endpoint URL is required'),
  apiKey: z.string().min(1, 'API key is required'),
  format: z.enum(['openai', 'anthropic', 'gemini', 'custom']),
  modelName: z.string().min(1, 'Model name is required'),
});

// Workflow schemas
const WorkflowTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required'),
  description: z.string().optional(),
  config: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    systemPrompt: z.string().optional(),
    maxTokens: z.number().int().min(1),
    concurrency: z.number().int().min(1).max(5000),
    iterations: z.number().int().min(1).max(10000000),
    streaming: z.boolean().optional(),
    warmupRuns: z.number().int().min(0).optional(),
    requestInterval: z.number().int().min(0).optional(),
    randomizeInterval: z.boolean().optional(),
    maxQps: z.number().min(0).max(1000).optional(),
    targetCacheHitRate: z.number().min(0).max(1).optional(),
  }),
  providers: z.array(z.string()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  description: z.string().optional(),
  providers: z.array(z.string().min(1)).min(1, 'At least one provider is required'),
  apiKeys: z.record(z.string(), z.string()).optional().default({}),
  tasks: z.array(WorkflowTaskSchema).min(1, 'At least one task is required'),
  options: z
    .object({
      stopOnFailure: z.boolean().optional(),
      cooldownBetweenTasks: z.number().int().min(0).optional(),
    })
    .optional(),
});

// Monitor schemas
export const MonitorConfigSchema = z.object({
  defaultIntervalMinutes: z.number().int().min(5).max(360),
  healthThresholds: z.object({
    tpsSlowThreshold: z.number().min(0),
    tpsVerySlowThreshold: z.number().min(0),
    ttftSlowMs: z.number().min(0),
    minOutputTokens: z.number().int().min(0),
  }),
});

export const MonitorTargetSchema = z.object({
  providerId: z.string().min(1),
  modelName: z.string().min(1),
  providerName: z.string().min(1),
  intervalMinutes: z.number().int().min(0),
});

export const MonitorTargetsArraySchema = z.array(MonitorTargetSchema).min(1, 'At least one target is required');

// Playground schemas
export const PlaygroundRunSchema = z.object({
  providerId: z.string().min(1, 'Provider ID is required'),
  modelName: z.string().min(1, 'Model name is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().min(1).max(1000000),
  enableThinking: z.boolean().optional(),
  images: z
    .array(
      z.object({
        type: z.enum(['url', 'base64']),
        url: z.string().optional(),
        mediaType: z.string().optional(),
        data: z.string().optional(),
      }),
    )
    .optional(),
});

export const PlaygroundStreamSchema = PlaygroundRunSchema.extend({
  useStreaming: z.boolean().optional().default(true),
});

// Export schema type for middleware
export type ValidationSchema = ZodSchema;

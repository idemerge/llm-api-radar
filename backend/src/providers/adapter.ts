import { randomUUID } from 'crypto';
import { LLMResponse, ProviderConfig, ProviderFormat, ImageInput } from '../types';
import { BaseLLMProvider } from './base';
import { providerStore } from '../services/providerStore';
import { decrypt } from '../utils/encryption';

// Session ID: generated once per process lifetime, shared across all Anthropic requests
const anthropicSessionId = randomUUID();

function buildAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'x-app': 'cli',
    'User-Agent': 'claude-cli/2.1.89 (external, sdk-cli)',
    'X-Claude-Code-Session-Id': anthropicSessionId,
    'x-client-request-id': randomUUID(),
  };
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

function buildOpenAIContent(prompt: string, images?: ImageInput[]): string | ContentPart[] {
  if (!images || images.length === 0) return prompt;
  const parts: ContentPart[] = [{ type: 'text', text: prompt }];
  for (const img of images) {
    if (img.type === 'url' && img.url) {
      parts.push({ type: 'image_url', image_url: { url: img.url } });
    } else if (img.type === 'base64' && img.data && img.mediaType) {
      parts.push({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
    }
  }
  return parts;
}

function buildAnthropicContent(prompt: string, images?: ImageInput[]): string | ContentPart[] {
  if (!images || images.length === 0) return prompt;
  const parts: ContentPart[] = [];
  for (const img of images) {
    if (img.type === 'base64' && img.data && img.mediaType) {
      parts.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    }
    // URL images not supported for Anthropic format — skip
  }
  parts.push({ type: 'text', text: prompt });
  return parts;
}

function buildGeminiParts(prompt: string, images?: ImageInput[]): any[] {
  const parts: any[] = [];
  for (const img of images || []) {
    if (img.type === 'base64' && img.data && img.mediaType) {
      parts.push({ inline_data: { mime_type: img.mediaType, data: img.data } });
    }
  }
  parts.push({ text: prompt });
  return parts;
}

export class DynamicProvider extends BaseLLMProvider {
  name: string;
  private config: ProviderConfig;
  private modelName: string;
  private plainApiKey?: string; // for test mode (skip decryption)

  constructor(config: ProviderConfig, modelName: string, plainApiKey?: string) {
    super();
    this.config = config;
    this.modelName = modelName;
    this.name = `${config.name}/${modelName}`;
    this.plainApiKey = plainApiKey;
  }

  async execute(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    _apiKey: string,
    streaming?: boolean,
    images?: ImageInput[],
  ): Promise<LLMResponse> {
    const apiKey = this.plainApiKey || decrypt(this.config.apiKey);

    switch (this.config.format) {
      case 'openai':
        return streaming
          ? this.callOpenAIStreaming(prompt, systemPrompt, maxTokens, apiKey, images)
          : this.callOpenAI(prompt, systemPrompt, maxTokens, apiKey, images);
      case 'anthropic':
        return streaming
          ? this.callAnthropicStreaming(prompt, systemPrompt, maxTokens, apiKey, images)
          : this.callAnthropic(prompt, systemPrompt, maxTokens, apiKey, images);
      case 'gemini':
        return streaming
          ? this.callGeminiStreaming(prompt, systemPrompt, maxTokens, apiKey, images)
          : this.callGemini(prompt, systemPrompt, maxTokens, apiKey, images);
      case 'custom':
        // Custom format defaults to OpenAI-compatible
        return streaming
          ? this.callOpenAIStreaming(prompt, systemPrompt, maxTokens, apiKey, images)
          : this.callOpenAI(prompt, systemPrompt, maxTokens, apiKey, images);
      default:
        throw new Error(`Unsupported format: ${this.config.format}`);
    }
  }

  // ---- OpenAI Compatible ----

  private async callOpenAI(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    images?: ImageInput[],
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const messages: Array<{ role: string; content: string | ContentPart[] }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: buildOpenAIContent(prompt, images) });

    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          max_tokens: maxTokens,
        }),
      },
      120000,
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const responseTime = Date.now() - startTime;
    const inputTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;

    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens,
      outputTokens: completionTokens,
      reasoningTokens,
      totalTokens: inputTokens + completionTokens,
      responseTime,
      firstTokenLatency: 0, // Non-streaming: no TTFT available
      estimatedCost: 0,
      model: this.modelName,
    };
  }

  private async callOpenAIStreaming(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    images?: ImageInput[],
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const messages: Array<{ role: string; content: string | ContentPart[] }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: buildOpenAIContent(prompt, images) });

    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
      },
      180000,
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let firstTokenTime: number | null = null;
    let buffer = '';
    let usageData: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (firstTokenTime === null) {
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content || delta?.reasoning_content) {
              firstTokenTime = Date.now();
            }
          }
          if (parsed.usage) usageData = parsed.usage;
        } catch {
          /* skip */
        }
      }
    }

    const responseTime = Date.now() - startTime;
    const firstTokenLatency = firstTokenTime ? firstTokenTime - startTime : 0;
    const inputTokens = usageData?.prompt_tokens || 0;
    const completionTokens = usageData?.completion_tokens || 0;
    const reasoningTokens = usageData?.completion_tokens_details?.reasoning_tokens || 0;

    return {
      text: '',
      inputTokens,
      outputTokens: completionTokens,
      reasoningTokens,
      totalTokens: inputTokens + completionTokens,
      responseTime,
      firstTokenLatency,
      estimatedCost: 0,
      model: this.modelName,
    };
  }

  // ---- Anthropic Compatible ----

  private async callAnthropic(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    images?: ImageInput[],
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const body: Record<string, any> = {
      model: this.modelName,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: buildAnthropicContent(prompt, images) }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/messages`,
      {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: JSON.stringify(body),
      },
      120000,
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const responseTime = Date.now() - startTime;
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    return {
      text: data.content?.[0]?.text || '',
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      responseTime,
      firstTokenLatency: 0, // Non-streaming: no TTFT available
      estimatedCost: 0,
      model: this.modelName,
    };
  }

  private async callAnthropicStreaming(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    images?: ImageInput[],
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const body: Record<string, any> = {
      model: this.modelName,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: buildAnthropicContent(prompt, images) }],
      stream: true,
    };
    if (systemPrompt) body.system = systemPrompt;

    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/messages`,
      {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: JSON.stringify(body),
      },
      180000,
    );

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let firstTokenTime: number | null = null;
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const parsed = JSON.parse(trimmed.slice(6));
          if (parsed.type === 'content_block_delta' && firstTokenTime === null) {
            firstTokenTime = Date.now();
          }
          if (parsed.type === 'message_start') {
            inputTokens = parsed.message?.usage?.input_tokens || 0;
          }
          if (parsed.type === 'message_delta') {
            outputTokens = parsed.usage?.output_tokens || outputTokens;
            // Some proxies (e.g. LiteLLM) return input_tokens in message_delta instead of message_start
            if (parsed.usage?.input_tokens) {
              inputTokens = parsed.usage.input_tokens;
            }
          }
        } catch {
          /* skip */
        }
      }
    }

    const responseTime = Date.now() - startTime;

    return {
      text: '',
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      responseTime,
      firstTokenLatency: firstTokenTime ? firstTokenTime - startTime : 0,
      estimatedCost: 0,
      model: this.modelName,
    };
  }

  // ---- Gemini Compatible ----

  private async callGemini(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    images?: ImageInput[],
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const contents: any[] = [];
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }
    contents.push({ role: 'user', parts: buildGeminiParts(prompt, images) });

    const url = `${this.config.endpoint}/models/${this.modelName}:generateContent?key=${apiKey}`;

    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
      120000,
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const responseTime = Date.now() - startTime;

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = data.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4);
    const outputTokens = data.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);

    return {
      text,
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      responseTime,
      firstTokenLatency: 0, // Non-streaming: no TTFT available
      estimatedCost: 0,
      model: this.modelName,
    };
  }

  private async callGeminiStreaming(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    images?: ImageInput[],
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const contents: any[] = [];
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }
    contents.push({ role: 'user', parts: buildGeminiParts(prompt, images) });

    const url = `${this.config.endpoint}/models/${this.modelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
      180000,
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let firstTokenTime: number | null = null;
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const parsed = JSON.parse(trimmed.slice(6));
          // Detect first content token
          if (firstTokenTime === null) {
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              firstTokenTime = Date.now();
            }
          }
          // Capture usage metadata from the final chunk
          if (parsed.usageMetadata) {
            inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens;
            outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens;
          }
        } catch {
          /* skip */
        }
      }
    }

    const responseTime = Date.now() - startTime;
    if (!inputTokens) inputTokens = Math.ceil(prompt.length / 4);

    return {
      text: '',
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      responseTime,
      firstTokenLatency: firstTokenTime ? firstTokenTime - startTime : 0,
      estimatedCost: 0,
      model: this.modelName,
    };
  }
}

// Factory: create a DynamicProvider from a stored provider config + model name
export function createDynamicProvider(providerId: string, modelName: string): DynamicProvider | null {
  const config = providerStore.get(providerId);
  if (!config) return null;

  const model = config.models.find((m) => m.name === modelName || m.id === modelName);
  if (!model) return null;

  // Skip inactive models
  if (model.isActive === false) return null;

  return new DynamicProvider(config, model.name);
}

// Test connectivity for a provider config (used by the test endpoint)
export async function testProviderConnection(config: {
  endpoint: string;
  apiKey: string;
  format: ProviderFormat;
  modelName: string;
}): Promise<{
  success: boolean;
  latencyMs: number;
  ttftMs: number;
  outputTokens: number;
  responseText: string;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const tempConfig: ProviderConfig = {
      id: 'test',
      name: 'test',
      endpoint: config.endpoint,
      apiKey: config.apiKey, // already plaintext for testing
      format: config.format,
      models: [
        {
          id: 'test',
          name: config.modelName,
          contextSize: 4096,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true,
          isActive: true,
        },
      ],
      createdAt: '',
      updatedAt: '',
    };

    const provider = new DynamicProvider(tempConfig, config.modelName, config.apiKey);
    const result = await provider.execute(
      'Write a 200-word introduction to artificial intelligence covering its history, current applications, and future potential.',
      undefined,
      1024,
      '',
      true,
    );

    const latencyMs = result.responseTime;
    const outputTokens = result.outputTokens || 0;
    const responseText = result.text || '';

    // Validate response content
    if (outputTokens === 0 && responseText.trim() === '') {
      return {
        success: false,
        latencyMs,
        ttftMs: result.firstTokenLatency || 0,
        outputTokens,
        responseText,
        error: 'Empty response (0 output tokens)',
      };
    }

    return {
      success: true,
      latencyMs,
      ttftMs: result.firstTokenLatency || 0,
      outputTokens,
      responseText,
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      ttftMs: 0,
      outputTokens: 0,
      responseText: '',
      error: err.message || 'Connection failed',
    };
  }
}

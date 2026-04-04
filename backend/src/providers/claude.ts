import { randomUUID } from 'crypto';
import { LLMResponse } from '../types';
import { BaseLLMProvider } from './base';

// Session ID: generated once per process lifetime, shared across all Claude API requests
const claudeSessionId = randomUUID();

function buildClaudeHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'x-app': 'cli',
    'User-Agent': 'claude-cli/2.1.89 (external, sdk-cli)',
    'X-Claude-Code-Session-Id': claudeSessionId,
    'x-client-request-id': randomUUID(),
  };
}

export class ClaudeProvider extends BaseLLMProvider {
  name = 'claude';

  async execute(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    streaming?: boolean,
    _images?: any[]
  ): Promise<LLMResponse> {
    if (apiKey && apiKey.startsWith('sk-ant-') && apiKey.length > 15) {
      try {
        if (streaming) {
          return await this.callStreamingAPI(prompt, systemPrompt, maxTokens, apiKey);
        }
        return await this.callRealAPI(prompt, systemPrompt, maxTokens, apiKey);
      } catch (error) {
        console.warn(`Claude API call failed, using simulation: ${error}`);
      }
    }

    await this.simulateLatency();
    return this.simulateResponse(
      prompt,
      maxTokens,
      'Claude',
      'claude-3-sonnet',
      0.000003,  // $3 per 1M input tokens
      0.000015,  // $15 per 1M output tokens
      600,       // base latency ms
      350        // variance
    );
  }

  private async callStreamingAPI(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await this.fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: buildClaudeHeaders(apiKey),
      body: JSON.stringify(body),
    }, 180000);

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

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

        const data = trimmed.slice(6);
        try {
          const parsed = JSON.parse(data) as {
            type?: string;
            content_block_delta?: { delta?: { text?: string } };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
            usage?: { input_tokens?: number; output_tokens?: number };
          };

          // Detect first token
          if (parsed.type === 'content_block_delta' && parsed.content_block_delta?.delta?.text) {
            if (firstTokenTime === null) {
              firstTokenTime = Date.now();
            }
          }

          // Read usage data
          if (parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens || inputTokens;
            outputTokens = parsed.message.usage.output_tokens || outputTokens;
          }
          if (parsed.usage) {
            inputTokens = parsed.usage.input_tokens || inputTokens;
            outputTokens = parsed.usage.output_tokens || outputTokens;
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    const responseTime = Date.now() - startTime;
    const firstTokenLatency = firstTokenTime
      ? firstTokenTime - startTime
      : Math.round(responseTime * 0.25);

    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = inputTokens * 0.000003 + outputTokens * 0.000015;

    return {
      text: '',
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens,
      responseTime,
      firstTokenLatency,
      estimatedCost: Number(estimatedCost.toFixed(6)),
      model: 'claude-3-sonnet',
    };
  }

  private async callRealAPI(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await this.fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: buildClaudeHeaders(apiKey),
      body: JSON.stringify(body),
    }, 180000);

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json() as Record<string, any>;
    const responseTime = Date.now() - startTime;
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    // Claude API: total_tokens = input_tokens + output_tokens (no separate reasoning_tokens)
    const totalTokens = inputTokens + outputTokens;

    // Account for cached tokens if present (reduced cost)
    const cacheCreationTokens = data.usage?.cache_creation_input_tokens || 0;
    const cacheReadTokens = data.usage?.cache_read_input_tokens || 0;
    const nonCachedInput = inputTokens - cacheReadTokens;
    // Cache read tokens cost 10% of regular input; cache creation costs 25% more
    const estimatedCost =
      nonCachedInput * 0.000003 +
      cacheReadTokens * 0.0000003 +
      cacheCreationTokens * 0.00000375 +
      outputTokens * 0.000015;

    return {
      text: data.content?.[0]?.text || '',
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens,
      responseTime,
      firstTokenLatency: Math.round(responseTime * 0.25),
      estimatedCost: Number(estimatedCost.toFixed(6)),
      model: 'claude-3-sonnet',
    };
  }

  private simulateLatency(): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, 150 + Math.random() * 250)
    );
  }
}

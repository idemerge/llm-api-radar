import { LLMResponse } from '../types';
import { BaseLLMProvider } from './base';

export class OpenAIProvider extends BaseLLMProvider {
  name = 'openai';

  async execute(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    streaming?: boolean,
    _images?: any[],
  ): Promise<LLMResponse> {
    // If a real API key is provided, attempt real API call
    if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 10) {
      try {
        if (streaming) {
          return await this.callStreamingAPI(prompt, systemPrompt, maxTokens, apiKey);
        }
        return await this.callRealAPI(prompt, systemPrompt, maxTokens, apiKey);
      } catch (error) {
        // Fall back to simulation on error
        console.warn(`OpenAI API call failed, using simulation: ${error}`);
      }
    }

    // Simulate with realistic OpenAI GPT-4 characteristics
    await this.simulateLatency();
    return this.simulateResponse(
      prompt,
      maxTokens,
      'OpenAI',
      'gpt-4',
      0.00003, // $0.03 per 1K input tokens
      0.00006, // $0.06 per 1K output tokens
      800, // base latency ms
      400, // variance
    );
  }

  private async callStreamingAPI(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
      },
      180000,
    );

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let firstTokenTime: number | null = null;
    let buffer = '';
    let usageData: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    } | null = null;

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
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
              completion_tokens_details?: { reasoning_tokens?: number };
            };
          };

          if (parsed.choices?.[0]?.delta?.content && firstTokenTime === null) {
            firstTokenTime = Date.now();
          }

          if (parsed.usage) {
            usageData = parsed.usage;
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    const responseTime = Date.now() - startTime;
    const firstTokenLatency = firstTokenTime ? firstTokenTime - startTime : Math.round(responseTime * 0.3);

    if (usageData) {
      const inputTokens = usageData.prompt_tokens || 0;
      const completionTokens = usageData.completion_tokens || 0;
      const reasoningTokens = usageData.completion_tokens_details?.reasoning_tokens || 0;
      const totalTokens = inputTokens + completionTokens;

      const nonReasoningOutput = completionTokens - reasoningTokens;
      const estimatedCost = inputTokens * 0.00003 + nonReasoningOutput * 0.00006 + reasoningTokens * 0.00006;

      return {
        text: '',
        inputTokens,
        outputTokens: completionTokens,
        reasoningTokens,
        totalTokens,
        responseTime,
        firstTokenLatency,
        estimatedCost: Number(estimatedCost.toFixed(6)),
        model: 'gpt-4',
        completionTokensDetails: reasoningTokens > 0 ? { reasoningTokens } : undefined,
      };
    }

    // Fallback estimation
    const inputTokens = Math.ceil(messages.map((m) => m.content).join('').length / 4);
    return {
      text: '',
      inputTokens,
      outputTokens: Math.min(maxTokens, 500),
      reasoningTokens: 0,
      totalTokens: inputTokens + Math.min(maxTokens, 500),
      responseTime,
      firstTokenLatency,
      estimatedCost: Number((inputTokens * 0.00003 + Math.min(maxTokens, 500) * 0.00006).toFixed(6)),
      model: 'gpt-4',
    };
  }

  private async callRealAPI(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages,
          max_tokens: maxTokens,
        }),
      },
      180000,
    );

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const responseTime = Date.now() - startTime;
    const inputTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    // OpenAI: completion_tokens already includes reasoning_tokens
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;

    // total_tokens = prompt_tokens + completion_tokens (standard formula, reasoning already included)
    const totalTokens = inputTokens + completionTokens;

    // Cost: reasoning tokens may have different pricing for o-series models
    // For standard GPT-4: reasoning_tokens = 0, so this is backward compatible
    const nonReasoningOutput = completionTokens - reasoningTokens;
    const estimatedCost = inputTokens * 0.00003 + nonReasoningOutput * 0.00006 + reasoningTokens * 0.00006; // same rate for GPT-4; o-series would differ

    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens,
      outputTokens: completionTokens,
      reasoningTokens,
      totalTokens,
      responseTime,
      firstTokenLatency: Math.round(responseTime * 0.3),
      estimatedCost: Number(estimatedCost.toFixed(6)),
      model: 'gpt-4',
      completionTokensDetails: reasoningTokens > 0 ? { reasoningTokens } : undefined,
    };
  }

  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 300));
  }
}

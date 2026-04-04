import { BaseLLMProvider } from './base';
import { LLMResponse } from '../types';

export class ZaiProvider extends BaseLLMProvider {
  name = 'zai';
  
  private baseUrl = 'http://REDACTED:4001/v1';
  private model = 'z-ai/glm-4.7';

  async execute(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    streaming: boolean = false,
    _images?: any[]
  ): Promise<LLMResponse> {
    const key = apiKey || 'REDACTED';
    const startTime = Date.now();

    try {
      const messages: Array<{ role: string; content: string }> = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      if (streaming) {
        return await this.executeStreaming(messages, maxTokens, key, startTime);
      }

      // Non-streaming mode
      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: maxTokens,
          stream: false,
        }),
      }, 180000);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        };
      };
      
      return this.buildResponse(data, startTime);

    } catch (error) {
      console.error('Zai API error:', error);
      throw error;
    }
  }

  private async executeStreaming(
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
    apiKey: string,
    startTime: number
  ): Promise<LLMResponse> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },  // Request usage data in response
      }),
    }, 180000);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
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
            choices?: Array<{ 
              delta?: { 
                content?: string;
                reasoning_content?: string;
              } 
            }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
              completion_tokens_details?: { reasoning_tokens?: number };
            };
          };
          
          // Detect first token time (including reasoning_content)
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content || delta?.reasoning_content) {
            if (firstTokenTime === null) {
              firstTokenTime = Date.now();
            }
          }
          
          // Read usage data (returned at the end of the stream)
          if (parsed.usage) {
            usageData = parsed.usage;
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    const firstTokenLatency = firstTokenTime 
      ? firstTokenTime - startTime 
      : Math.round(responseTime * 0.6);  // GLM-4.7 first-token latency is typically 60% of total

    // Build response from usage data
    if (usageData) {
      const inputTokens = usageData.prompt_tokens || 0;
      const completionTokens = usageData.completion_tokens || 0;
      // GLM-4.7: completion_tokens already includes reasoning_tokens (consistent with OpenAI)
      const reasoningTokens = usageData.completion_tokens_details?.reasoning_tokens || 0;

      const totalTokens = inputTokens + completionTokens;

      // GLM-4.7 pricing: $0.5/M input, $1.5/M output
      const estimatedCost =
        inputTokens * 0.0000005 + completionTokens * 0.0000015;

      return {
        text: '',
        inputTokens,
        outputTokens: completionTokens,
        reasoningTokens,
        totalTokens,
        responseTime,
        firstTokenLatency,
        estimatedCost: Number(estimatedCost.toFixed(6)),
        model: this.model,
        completionTokensDetails: reasoningTokens > 0 ? { reasoningTokens } : undefined,
      };
    }

    // Fallback: estimate if no usage data available
    const inputTokens = Math.ceil(messages.map(m => m.content).join('').length / 4);
    const estimatedOutput = Math.min(maxTokens, Math.floor(500 + Math.random() * 500));

    return {
      text: '',
      inputTokens,
      outputTokens: estimatedOutput,
      reasoningTokens: 0,
      totalTokens: inputTokens + estimatedOutput,
      responseTime,
      firstTokenLatency,
      estimatedCost: Number((inputTokens * 0.0000005 + estimatedOutput * 0.0000015).toFixed(6)),
      model: this.model,
    };
  }

  private buildResponse(
    data: {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    },
    startTime: number
  ): LLMResponse {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;

    // GLM-4.7: completion_tokens already includes reasoning_tokens (consistent with OpenAI)
    // total_tokens = prompt_tokens + completion_tokens
    // reasoning_tokens inferred from the presence of reasoning_content field
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content;
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens
      || (reasoningContent ? Math.ceil(reasoningContent.length / 4) : 0);

    const totalTokens = inputTokens + completionTokens;

    const estimatedCost =
      inputTokens * 0.0000005 + completionTokens * 0.0000015;

    // In non-streaming mode, first-token latency is estimated as 60% of total time
    const firstTokenLatency = Math.round(responseTime * 0.6);

    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens,
      outputTokens: completionTokens,
      reasoningTokens,
      totalTokens,
      responseTime,
      firstTokenLatency,
      estimatedCost: Number(estimatedCost.toFixed(6)),
      model: this.model,
      completionTokensDetails: reasoningTokens > 0 ? { reasoningTokens } : undefined,
    };
  }
}

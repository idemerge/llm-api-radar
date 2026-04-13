import { LLMResponse } from '../types';
import { BaseLLMProvider } from './base';

export class GeminiProvider extends BaseLLMProvider {
  name = 'gemini';

  async execute(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    streaming?: boolean,
    _images?: any[],
  ): Promise<LLMResponse> {
    if (apiKey && apiKey.startsWith('AI') && apiKey.length > 10) {
      try {
        if (streaming) {
          return await this.callStreamingAPI(prompt, systemPrompt, maxTokens, apiKey);
        }
        return await this.callRealAPI(prompt, systemPrompt, maxTokens, apiKey);
      } catch (error) {
        console.warn(`Gemini API call failed, using simulation: ${error}`);
      }
    }

    await this.simulateLatency();
    return this.simulateResponse(
      prompt,
      maxTokens,
      'Gemini',
      'gemini-pro',
      0.0000005, // $0.50 per 1M input tokens
      0.0000015, // $1.50 per 1M output tokens
      500, // base latency ms
      300, // variance
    );
  }

  private async callStreamingAPI(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const response = await this.fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
      180000,
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let firstTokenTime: number | null = null;
    let buffer = '';
    let inputTokens = Math.ceil(fullPrompt.length / 4);
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
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
            }>;
            usageMetadata?: {
              promptTokenCount?: number;
              candidatesTokenCount?: number;
            };
          };

          // Detect first token
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && firstTokenTime === null) {
            firstTokenTime = Date.now();
          }

          // Read usage data
          if (parsed.usageMetadata) {
            inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens;
            outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens;
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    const responseTime = Date.now() - startTime;
    const firstTokenLatency = firstTokenTime ? firstTokenTime - startTime : Math.round(responseTime * 0.2);

    // If outputTokens was not retrieved from the API, estimate it
    if (outputTokens === 0) {
      outputTokens = Math.min(maxTokens, 500);
    }

    const totalTokens = inputTokens + outputTokens;

    return {
      text: '',
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens,
      responseTime,
      firstTokenLatency,
      estimatedCost: Number((inputTokens * 0.0000005 + outputTokens * 0.0000015).toFixed(6)),
      model: 'gemini-pro',
    };
  }

  private async callRealAPI(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const response = await this.fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
      180000,
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const responseTime = Date.now() - startTime;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Use usageMetadata from API when available, fall back to character estimation
    const usageMetadata = data.usageMetadata;
    const inputTokens = usageMetadata?.promptTokenCount || Math.ceil(fullPrompt.length / 4);
    const outputTokens = usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);
    const totalTokens = inputTokens + outputTokens;

    return {
      text,
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens,
      responseTime,
      firstTokenLatency: Math.round(responseTime * 0.2),
      estimatedCost: Number((inputTokens * 0.0000005 + outputTokens * 0.0000015).toFixed(6)),
      model: 'gemini-pro',
    };
  }

  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
  }
}

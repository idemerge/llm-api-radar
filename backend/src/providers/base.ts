import { LLMProvider, LLMResponse, ImageInput } from '../types';

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;

  abstract execute(
    prompt: string,
    systemPrompt: string | undefined,
    maxTokens: number,
    apiKey: string,
    streaming?: boolean,
    images?: ImageInput[],
  ): Promise<LLMResponse>;

  protected fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 120000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  protected simulateResponse(
    prompt: string,
    maxTokens: number,
    providerName: string,
    model: string,
    costPerInputToken: number,
    costPerOutputToken: number,
    baseLatency: number,
    latencyVariance: number,
  ): LLMResponse {
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.min(maxTokens, Math.floor(50 + Math.random() * 200));
    const totalTokens = inputTokens + outputTokens;

    const responseTime = baseLatency + Math.random() * latencyVariance + outputTokens * (2 + Math.random() * 3);
    const firstTokenLatency = baseLatency * 0.3 + Math.random() * (baseLatency * 0.4);

    const estimatedCost = inputTokens * costPerInputToken + outputTokens * costPerOutputToken;

    return {
      text: `[Simulated ${providerName} response - ${outputTokens} tokens generated]`,
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens,
      responseTime: Math.round(responseTime),
      firstTokenLatency: Math.round(firstTokenLatency),
      estimatedCost: Number(estimatedCost.toFixed(6)),
      model,
    };
  }
}

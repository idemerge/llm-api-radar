import { useState, useRef, useCallback } from 'react';
import { ImageInput } from '../types';
import { apiFetch } from '../services/api';

export interface PlaygroundMetrics {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  responseTime: number;
  firstTokenLatency: number;
  tokensPerSecond: number;
  model: string;
}

export interface PlaygroundParams {
  providerId: string;
  modelName: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  images?: ImageInput[];
  enableThinking?: boolean;
}

export function usePlayground() {
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [reasoningText, setReasoningText] = useState('');
  const [metrics, setMetrics] = useState<PlaygroundMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setResponseText('');
    setReasoningText('');
    setMetrics(null);
    setError(null);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreaming(false);
  }, []);

  /** Non-streaming: POST /api/playground/run */
  const runPrompt = useCallback(async (params: PlaygroundParams) => {
    reset();
    setLoading(true);
    abortRef.current = new AbortController();

    try {
      const res = await apiFetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortRef.current.signal,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }

      setResponseText(data.text || '');
      setMetrics({
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
        reasoningTokens: data.reasoningTokens || 0,
        totalTokens: data.totalTokens || 0,
        responseTime: data.responseTime || 0,
        firstTokenLatency: data.firstTokenLatency || 0,
        tokensPerSecond: data.tokensPerSecond || 0,
        model: data.model || '',
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Request failed');
      }
    } finally {
      setLoading(false);
    }
  }, [reset]);

  /** Streaming: POST /api/playground/stream (SSE) */
  const streamPrompt = useCallback(async (params: PlaygroundParams) => {
    reset();
    setLoading(true);
    setStreaming(true);
    abortRef.current = new AbortController();

    try {
      const res = await apiFetch('/api/playground/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortRef.current.signal,
      });

      // If the response is JSON (error case), handle it
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errData = await res.json();
        setError(errData.error || `HTTP ${res.status}`);
        return;
      }

      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const raw = trimmed.slice(6);
          if (raw === '[DONE]') continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === 'chunk') {
              setResponseText(prev => prev + event.text);
            } else if (event.type === 'reasoning') {
              setReasoningText(prev => prev + event.text);
            } else if (event.type === 'done') {
              // Set final text (in case chunks were missed)
              if (event.text) setResponseText(event.text);
              if (event.reasoningText) setReasoningText(event.reasoningText);
              setMetrics({
                inputTokens: event.inputTokens || 0,
                outputTokens: event.outputTokens || 0,
                reasoningTokens: event.reasoningTokens || 0,
                totalTokens: event.totalTokens || 0,
                responseTime: event.responseTime || 0,
                firstTokenLatency: event.firstTokenLatency || 0,
                tokensPerSecond: event.tokensPerSecond || 0,
                model: event.model || '',
              });
            } else if (event.type === 'error') {
              setError(event.message || 'Stream error');
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Stream failed');
      }
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }, [reset]);

  return {
    loading,
    streaming,
    responseText,
    reasoningText,
    metrics,
    error,
    runPrompt,
    streamPrompt,
    abort,
    reset,
  };
}

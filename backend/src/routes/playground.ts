import { Router, Request, Response as ExpressResponse } from 'express';
import { randomUUID } from 'crypto';
import { providerStore } from '../services/providerStore';
import { DynamicProvider } from '../providers/adapter';
import { ImageInput } from '../types';

const router = Router();

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** Build OpenAI-style multimodal content array */
function buildOpenAIContent(prompt: string, images: ImageInput[]): string | ContentPart[] {
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

/** Fetch a remote image URL and return as {mediaType, data} base64 */
async function fetchImageAsBase64(url: string): Promise<{ mediaType: string; data: string } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer).toString('base64');
    return { mediaType: contentType.split(';')[0], data };
  } catch {
    return null;
  }
}

/** Resolve all images to base64 (fetching URLs as needed) */
async function resolveImagesToBase64(images: ImageInput[]): Promise<ImageInput[]> {
  const resolved: ImageInput[] = [];
  for (const img of images) {
    if (img.type === 'url' && img.url) {
      const fetched = await fetchImageAsBase64(img.url);
      if (fetched) {
        resolved.push({ type: 'base64', mediaType: fetched.mediaType, data: fetched.data });
      }
      // Skip silently if fetch fails (image may be unreachable)
    } else {
      resolved.push(img);
    }
  }
  return resolved;
}

/** Build Anthropic-style multimodal content array */
async function buildAnthropicContent(prompt: string, images: ImageInput[]): Promise<string | ContentPart[]> {
  if (!images || images.length === 0) return prompt;
  const resolvedImages = await resolveImagesToBase64(images);
  if (resolvedImages.length === 0) return prompt;
  const parts: ContentPart[] = [];
  for (const img of resolvedImages) {
    if (img.type === 'base64' && img.data && img.mediaType) {
      parts.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    }
  }
  parts.push({ type: 'text', text: prompt });
  return parts;
}

function buildAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'x-app': 'cli',
    'User-Agent': 'claude-cli/2.1.89 (external, sdk-cli)',
    'X-Claude-Code-Session-Id': randomUUID(),
    'x-client-request-id': randomUUID(),
  };
}

function resolveProvider(providerId: string, modelName: string) {
  const config = providerStore.get(providerId);
  if (!config) return { error: 'Provider not found' };

  const model = config.models.find(m => m.name === modelName || m.id === modelName);
  if (!model) return { error: `Model "${modelName}" not found in provider` };
  if (model.isActive === false) return { error: `Model "${modelName}" is inactive` };

  const apiKey = providerStore.getDecryptedApiKey(providerId);
  if (!apiKey) return { error: 'Failed to decrypt API key' };

  return { config, model, apiKey };
}

/** Fetch with timeout + AbortController, matching the adapter's pattern exactly */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 180000): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ---- POST /api/playground/run (non-streaming) ----

router.post('/run', async (req: Request, res: ExpressResponse) => {
  const { providerId, modelName, prompt, systemPrompt, maxTokens = 4096, images }: {
    providerId: string; modelName: string; prompt: string;
    systemPrompt?: string; maxTokens?: number; images?: ImageInput[];
  } = req.body;

  if (!providerId || !modelName || !prompt) {
    return res.status(400).json({ error: 'providerId, modelName, and prompt are required' });
  }

  const resolved = resolveProvider(providerId, modelName);
  if ('error' in resolved) {
    return res.status(400).json({ error: resolved.error });
  }

  const { config, model, apiKey } = resolved;

  try {
    const provider = new DynamicProvider(config, model.name, apiKey);
    const response = await provider.execute(prompt, systemPrompt, maxTokens, '', false, images);

    const tokensPerSecond = response.outputTokens > 0 && response.responseTime > 0
      ? Math.round((response.outputTokens / response.responseTime) * 1000)
      : 0;

    return res.json({
      success: true,
      ...response,
      tokensPerSecond,
      provider: config.name,
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      error: err.message || 'Request failed',
      provider: config.name,
      model: model.name,
    });
  }
});

// ---- POST /api/playground/stream (SSE streaming) ----

router.post('/stream', async (req: Request, res: ExpressResponse) => {
  const { providerId, modelName, prompt, systemPrompt, maxTokens = 4096, images }: {
    providerId: string; modelName: string; prompt: string;
    systemPrompt?: string; maxTokens?: number; images?: ImageInput[];
  } = req.body;

  if (!providerId || !modelName || !prompt) {
    return res.status(400).json({ error: 'providerId, modelName, and prompt are required' });
  }

  const resolved = resolveProvider(providerId, modelName);
  if ('error' in resolved) {
    return res.status(400).json({ error: resolved.error });
  }

  const { config, model, apiKey } = resolved;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let aborted = false;
  res.on('close', () => { aborted = true; });

  const startTime = Date.now();

  try {
    switch (config.format) {
      case 'openai':
      case 'custom':
        await streamOpenAI(config.endpoint, model.name, apiKey, prompt, systemPrompt, maxTokens, images, startTime, sendEvent, () => aborted);
        break;
      case 'anthropic':
        await streamAnthropic(config.endpoint, apiKey, model.name, prompt, systemPrompt, maxTokens, images, startTime, sendEvent, () => aborted);
        break;
      case 'gemini':
        await streamGemini(config.endpoint, model.name, apiKey, prompt, systemPrompt, maxTokens, images, startTime, sendEvent, () => aborted);
        break;
      default:
        // Unknown format: fall back to non-streaming via DynamicProvider
        await streamFallback(config, model.name, apiKey, prompt, systemPrompt, maxTokens, images, startTime, sendEvent, () => aborted);
    }
  } catch (err: any) {
    if (!aborted) {
      sendEvent({ type: 'error', message: err.message || 'Stream failed' });
    }
  }

  if (!aborted) {
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

// ---- Stream: OpenAI format ----
// Uses fetch + AbortController + getReader(), matching adapter.ts exactly

async function streamOpenAI(
  endpoint: string, modelName: string, apiKey: string,
  prompt: string, systemPrompt: string | undefined, maxTokens: number,
  images: ImageInput[] | undefined,
  startTime: number, sendEvent: (d: any) => void, isAborted: () => boolean
) {
  const messages: Array<{ role: string; content: string | ContentPart[] }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: buildOpenAIContent(prompt, images || []) });

  const response = await fetchWithTimeout(
    `${endpoint}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
    },
    180000
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenTime: number | null = null;
  let fullText = '';
  let reasoningText = '';
  let usageData: any = null;

  try {
    while (true) {
      if (isAborted()) break;
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
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content || '';
          const reasoning = delta?.reasoning_content || '';

          if ((content || reasoning) && firstTokenTime === null) {
            firstTokenTime = Date.now();
          }

          if (content) {
            fullText += content;
            sendEvent({ type: 'chunk', text: content });
          }
          if (reasoning) {
            reasoningText += reasoning;
            sendEvent({ type: 'reasoning', text: reasoning });
          }

          if (parsed.usage) usageData = parsed.usage;
        } catch { /* skip malformed chunk */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  emitDone(sendEvent, isAborted, startTime, firstTokenTime, modelName, fullText, reasoningText, {
    inputTokens: usageData?.prompt_tokens || 0,
    outputTokens: usageData?.completion_tokens || 0,
    reasoningTokens: usageData?.completion_tokens_details?.reasoning_tokens || 0,
  });
}

// ---- Stream: Anthropic format ----

async function streamAnthropic(
  endpoint: string, apiKey: string, modelName: string,
  prompt: string, systemPrompt: string | undefined, maxTokens: number,
  images: ImageInput[] | undefined,
  startTime: number, sendEvent: (d: any) => void, isAborted: () => boolean
) {
  const body: Record<string, any> = {
    model: modelName,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: await buildAnthropicContent(prompt, images || []) }],
    stream: true,
  };
  if (systemPrompt) body.system = systemPrompt;

  const response = await fetchWithTimeout(
    `${endpoint}/messages`,
    {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify(body),
    },
    180000
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenTime: number | null = null;
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      if (isAborted()) break;
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

          if (parsed.type === 'message_start') {
            inputTokens = parsed.message?.usage?.input_tokens || 0;
          }
          if (parsed.type === 'content_block_delta') {
            const text = parsed.delta?.text || '';
            if (text) {
              if (firstTokenTime === null) firstTokenTime = Date.now();
              fullText += text;
              sendEvent({ type: 'chunk', text });
            }
          }
          if (parsed.type === 'message_delta') {
            outputTokens = parsed.usage?.output_tokens || 0;
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  emitDone(sendEvent, isAborted, startTime, firstTokenTime, modelName, fullText, '', {
    inputTokens,
    outputTokens,
    reasoningTokens: 0,
  });
}

// ---- Stream: Gemini format ----

async function buildGeminiParts(prompt: string, images?: ImageInput[]): Promise<any[]> {
  const parts: any[] = [];
  const resolvedImages = images ? await resolveImagesToBase64(images) : [];
  for (const img of resolvedImages) {
    if (img.type === 'base64' && img.data && img.mediaType) {
      parts.push({ inline_data: { mime_type: img.mediaType, data: img.data } });
    }
  }
  parts.push({ text: prompt });
  return parts;
}

async function streamGemini(
  endpoint: string, modelName: string, apiKey: string,
  prompt: string, systemPrompt: string | undefined, maxTokens: number,
  images: ImageInput[] | undefined,
  startTime: number, sendEvent: (d: any) => void, isAborted: () => boolean
) {
  const contents: any[] = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
  }
  contents.push({ role: 'user', parts: await buildGeminiParts(prompt, images) });

  const url = `${endpoint}/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  }, 180000);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenTime: number | null = null;
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      if (isAborted()) break;
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
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            if (firstTokenTime === null) firstTokenTime = Date.now();
            fullText += text;
            sendEvent({ type: 'chunk', text });
          }
          if (parsed.usageMetadata) {
            inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens;
            outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens;
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  emitDone(sendEvent, isAborted, startTime, firstTokenTime, modelName, fullText, '', {
    inputTokens,
    outputTokens,
    reasoningTokens: 0,
  });
}

// ---- Fallback: non-streaming via DynamicProvider ----

async function streamFallback(
  config: any, modelName: string, apiKey: string,
  prompt: string, systemPrompt: string | undefined, maxTokens: number,
  images: ImageInput[] | undefined,
  startTime: number, sendEvent: (d: any) => void, isAborted: () => boolean
) {
  const provider = new DynamicProvider(config, modelName, apiKey);
  const response = await provider.execute(prompt, systemPrompt, maxTokens, '', false, images);

  if (!isAborted()) {
    if (response.text) {
      sendEvent({ type: 'chunk', text: response.text });
    }
    emitDone(sendEvent, isAborted, startTime, null, modelName, response.text, '', {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      reasoningTokens: response.reasoningTokens,
    });
  }
}

// ---- Shared: emit final 'done' event ----

function emitDone(
  sendEvent: (d: any) => void,
  isAborted: () => boolean,
  startTime: number,
  firstTokenTime: number | null,
  modelName: string,
  fullText: string,
  reasoningText: string,
  tokens: { inputTokens: number; outputTokens: number; reasoningTokens: number }
) {
  if (isAborted()) return;
  const responseTime = Date.now() - startTime;
  const firstTokenLatency = firstTokenTime ? firstTokenTime - startTime : 0;
  const { inputTokens, outputTokens, reasoningTokens } = tokens;

  sendEvent({
    type: 'done',
    text: fullText,
    reasoningText,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens,
    responseTime,
    firstTokenLatency,
    tokensPerSecond: outputTokens > 0 ? Math.round((outputTokens / responseTime) * 1000) : 0,
    model: modelName,
  });
}

export default router;

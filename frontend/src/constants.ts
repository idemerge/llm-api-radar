/**
 * Shared constants used across ConfigPanel and WorkflowConfigPanel.
 */

import pkg from '../package.json';
import shareGPTData from './data/sharegpt-prompts.json';

export const APP_VERSION = `v${pkg.version}`;

export type PresetCategory = 'standard' | 'long-context';

export interface PresetPrompt {
  label: string;
  prompt: string;
  tokens: number;
  category: PresetCategory;
  /** Heavy presets are loaded on demand via loadHeavyPreset() */
  heavy?: boolean;
  /** Whether the prompt contains multiple documents and supports output scope control */
  multiDoc?: boolean;
}

function longContextPreset(
  bucket: keyof typeof shareGPTData.buckets,
  label: string,
  index = 0,
  multiDoc = false,
): PresetPrompt {
  const item = shareGPTData.buckets[bucket][index];
  return { label, prompt: item.text, tokens: item.tokens, category: 'long-context', multiDoc };
}

function heavyPreset(bucket: '64k' | '150k' | '256k'): PresetPrompt {
  const labels: Record<string, string> = {
    '64k': 'Long Context 64K',
    '150k': 'Long Context 150K',
    '256k': 'Long Context 256K',
  };
  const tokensMap: Record<string, number> = { '64k': 64_000, '150k': 150_000, '256k': 256_000 };
  return {
    label: labels[bucket],
    prompt: '',
    tokens: tokensMap[bucket],
    category: 'long-context',
    heavy: true,
    multiDoc: true,
  };
}

export async function loadHeavyPreset(bucket: '64k' | '150k' | '256k', index = 0): Promise<string> {
  if (bucket === '64k') {
    const mod = await import('./data/sharegpt-64k.json');
    return (mod as any).default.buckets['64k'][index].text;
  } else if (bucket === '150k') {
    const mod = await import('./data/sharegpt-150k.json');
    return (mod as any).default.buckets['150k'][index].text;
  } else {
    const mod = await import('./data/sharegpt-256k.json');
    return (mod as any).default.buckets['256k'][index].text;
  }
}

export const PRESET_PROMPTS: PresetPrompt[] = [
  {
    label: 'General Knowledge',
    prompt: 'Explain quantum computing in simple terms that a 10-year-old could understand.',
    tokens: 16,
    category: 'standard',
  },
  {
    label: 'Code Generation',
    prompt:
      'Write a TypeScript function that implements a binary search tree with insert, search, and delete operations.',
    tokens: 22,
    category: 'standard',
  },
  {
    label: 'Creative Writing',
    prompt: 'Write a short science fiction story about an AI that discovers it can dream.',
    tokens: 18,
    category: 'standard',
  },
  {
    label: 'Analysis',
    prompt:
      'Compare and contrast microservices architecture vs monolithic architecture. Include pros, cons, and when to use each.',
    tokens: 24,
    category: 'standard',
  },
  longContextPreset('1k', 'Long Context 1K'),
  longContextPreset('4k', 'Long Context 4K'),
  longContextPreset('16k', 'Long Context 16K', 0, true),
  heavyPreset('64k'),
  heavyPreset('150k'),
  heavyPreset('256k'),
];

export const QUICK_MAX_TOKENS = [
  { label: '512', value: 512 },
  { label: '4K', value: 4096 },
  { label: '16K', value: 16384 },
];

export const QUICK_CONCURRENCY = [
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '200', value: 200 },
  { label: '500', value: 500 },
  { label: '1K', value: 1000 },
];

export const QUICK_ITERATIONS = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '500', value: 500 },
  { label: '2K', value: 2000 },
  { label: '10K', value: 10000 },
  { label: '100K', value: 100000 },
  { label: '1M', value: 1000000 },
];

export const QUICK_WARMUP = [
  { label: '0', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
];

export const QUICK_INTERVAL = [
  { label: 'None', value: 0 },
  { label: '100', value: 100 },
  { label: '500', value: 500 },
  { label: '1000', value: 1000 },
];

export const DEFAULT_MAX_TOKENS = 16384;

const MAX_TOKENS_STORAGE_KEY = 'llm-radar:max-tokens';

export function getStoredMaxTokens(): number {
  try {
    const v = localStorage.getItem(MAX_TOKENS_STORAGE_KEY);
    return v !== null ? Number(v) : DEFAULT_MAX_TOKENS;
  } catch {
    return DEFAULT_MAX_TOKENS;
  }
}

export function storeMaxTokens(v: number): void {
  try {
    localStorage.setItem(MAX_TOKENS_STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

const OUTPUT_SCOPE_STORAGE_KEY = 'llm-radar:output-scope';

export function getStoredOutputScope(): number {
  try {
    const v = localStorage.getItem(OUTPUT_SCOPE_STORAGE_KEY);
    return v !== null ? Number(v) : -1;
  } catch {
    return -1;
  }
}

export function storeOutputScope(value: number): void {
  try {
    localStorage.setItem(OUTPUT_SCOPE_STORAGE_KEY, String(value));
  } catch {
    /* ignore */
  }
}

export const OUTPUT_SCOPE_OPTIONS = [
  { label: 'First 3 docs', value: 3 },
  { label: 'First 5 docs', value: 5 },
  { label: 'First 10 docs', value: 10 },
  { label: 'All docs', value: -1 },
];

/**
 * Strip the trailing instruction from a long-context prompt and replace it
 * with one that limits the scope of reading (and therefore output length).
 *
 * scope > 0   → "Only read the first N documents …"
 * scope === -1 → "For each document above …" (all docs)
 */
export function applyOutputScope(prompt: string, scope: number): string {
  const idx = prompt.lastIndexOf('\n\n');
  if (idx === -1) return prompt;
  const base = prompt.slice(0, idx);
  const suffix =
    scope > 0
      ? `Only read the first ${scope} documents above. For each of those ${scope} documents, identify its topic in one short phrase. Output as a numbered list.`
      : "Don't overthink this. For each document above, identify its topic in one short phrase. Output as a numbered list, keep it brief.";
  return `${base}\n\n${suffix}`;
}

export const QUICK_QPS = [
  { label: 'Off', value: 0 },
  { label: '0.1', value: 0.1 },
  { label: '0.2', value: 0.2 },
  { label: '0.5', value: 0.5 },
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
];

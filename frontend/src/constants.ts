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
}

function longContextPreset(bucket: keyof typeof shareGPTData.buckets, label: string, index = 0): PresetPrompt {
  const item = shareGPTData.buckets[bucket][index];
  return { label, prompt: item.text, tokens: item.tokens, category: 'long-context' };
}

function heavyPreset(bucket: '64k' | '256k'): PresetPrompt {
  const label = bucket === '64k' ? 'Long Context 64K' : 'Long Context 256K';
  const tokens = bucket === '64k' ? 64_000 : 256_000;
  return { label, prompt: '', tokens, category: 'long-context', heavy: true };
}

export async function loadHeavyPreset(bucket: '64k' | '256k', index = 0): Promise<string> {
  const mod = bucket === '64k' ? await import('./data/sharegpt-64k.json') : await import('./data/sharegpt-256k.json');
  return (mod as any).default.buckets[bucket][index].text;
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
  longContextPreset('16k', 'Long Context 16K'),
  heavyPreset('64k'),
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
];

export const QUICK_ITERATIONS = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
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

export const QUICK_QPS = [
  { label: 'Off', value: 0 },
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
];

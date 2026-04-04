/**
 * Shared constants used across ConfigPanel and WorkflowConfigPanel.
 */

import pkg from '../package.json';

export const APP_VERSION = `v${pkg.version}`;

export function generateLongContextPrompt(targetChars: number): string {
  const prefix =
    'Analyze the following long text and provide a comprehensive summary including key themes, patterns, and insights:\n\n';
  const paragraph =
    'The development of artificial intelligence has been one of the most transformative technological advances in recent decades. Machine learning algorithms have evolved from simple pattern recognition systems to complex neural networks capable of generating human-like text, creating art, and solving scientific problems. This rapid progress has raised important questions about ethics, safety, and the future relationship between humans and intelligent machines. Researchers continue to push boundaries while grappling with challenges around bias, transparency, and alignment with human values. ';
  const repetitions = Math.ceil((targetChars - prefix.length) / paragraph.length);
  return prefix + Array(repetitions).fill(paragraph).join('');
}

export const PRESET_PROMPTS = [
  {
    label: 'General Knowledge',
    prompt:
      'Explain quantum computing in simple terms that a 10-year-old could understand.',
  },
  {
    label: 'Code Generation',
    prompt:
      'Write a TypeScript function that implements a binary search tree with insert, search, and delete operations.',
  },
  {
    label: 'Creative Writing',
    prompt:
      'Write a short science fiction story about an AI that discovers it can dream.',
  },
  {
    label: 'Analysis',
    prompt:
      'Compare and contrast microservices architecture vs monolithic architecture. Include pros, cons, and when to use each.',
  },
  { label: 'Long Context 10K', prompt: generateLongContextPrompt(10000) },
  { label: 'Long Context 50K', prompt: generateLongContextPrompt(50000) },
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

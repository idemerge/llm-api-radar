import { describe, it, expect } from 'vitest';

// Test the helper functions used in MonitorPage
// These are extracted here for testability

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type HealthStatus = 'healthy' | 'slow' | 'very_slow' | 'down';

function getStatusLabel(cls: HealthStatus): string {
  if (cls === 'down') return 'Down';
  if (cls === 'very_slow') return 'Very Slow';
  if (cls === 'slow') return 'Slow';
  return 'Healthy';
}

function computeTps(outputTokens: number, latencyMs: number): number {
  if (latencyMs <= 0) return 0;
  return Math.round((outputTokens / latencyMs) * 1000);
}

describe('formatTime', () => {
  it('formats ISO string to M/D HH:MM', () => {
    const result = formatTime('2026-04-10T14:30:00.000Z');
    expect(result).toMatch(/\d+\/\d+ \d{2}:\d{2}/);
  });
});

describe('formatLatency', () => {
  it('returns ms for values under 1000', () => {
    expect(formatLatency(500)).toBe('500ms');
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('returns seconds for values >= 1000', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(1500)).toBe('1.5s');
    expect(formatLatency(2345)).toBe('2.3s');
  });
});

describe('getStatusLabel', () => {
  it('maps health status to display label', () => {
    expect(getStatusLabel('healthy')).toBe('Healthy');
    expect(getStatusLabel('slow')).toBe('Slow');
    expect(getStatusLabel('very_slow')).toBe('Very Slow');
    expect(getStatusLabel('down')).toBe('Down');
  });
});

describe('computeTps', () => {
  it('calculates tokens per second', () => {
    expect(computeTps(100, 1000)).toBe(100);
    expect(computeTps(50, 500)).toBe(100);
    expect(computeTps(150, 2000)).toBe(75);
  });

  it('returns 0 for zero latency', () => {
    expect(computeTps(100, 0)).toBe(0);
  });

  it('returns 0 for negative latency', () => {
    expect(computeTps(100, -1)).toBe(0);
  });
});

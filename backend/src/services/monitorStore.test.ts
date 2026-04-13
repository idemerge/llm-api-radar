import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// We test the store logic directly with an in-memory database
// to avoid coupling to the singleton and filesystem

type HealthStatus = 'healthy' | 'slow' | 'very_slow' | 'down';

interface PingResult {
  id: number;
  providerId: string;
  providerName: string;
  modelName: string;
  status: 'ok' | 'error';
  healthStatus: HealthStatus;
  latencyMs: number;
  ttftMs: number;
  outputTokens: number;
  responseText?: string;
  errorMessage?: string;
  checkedAt: string;
}

function mapRow(row: any): PingResult {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    modelName: row.model_name,
    status: row.status,
    healthStatus: row.health_status || 'down',
    latencyMs: row.latency_ms,
    ttftMs: row.ttft_ms || 0,
    outputTokens: row.output_tokens || 0,
    responseText: row.response_text || undefined,
    errorMessage: row.error_message || undefined,
    checkedAt: row.checked_at,
  };
}

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE monitor_pings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      model_name TEXT NOT NULL,
      status TEXT NOT NULL,
      health_status TEXT NOT NULL DEFAULT 'down',
      latency_ms INTEGER NOT NULL,
      ttft_ms INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      response_text TEXT,
      error_message TEXT,
      checked_at TEXT NOT NULL
    )
  `);
  return db;
}

function insertPing(db: Database.Database, ping: Omit<PingResult, 'id'>): void {
  db.prepare(
    `
    INSERT INTO monitor_pings (provider_id, provider_name, model_name, status, health_status, latency_ms, ttft_ms, output_tokens, response_text, error_message, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    ping.providerId,
    ping.providerName,
    ping.modelName,
    ping.status,
    ping.healthStatus,
    ping.latencyMs,
    ping.ttftMs || 0,
    ping.outputTokens || 0,
    ping.responseText?.slice(0, 200) || null,
    ping.errorMessage || null,
    ping.checkedAt,
  );
}

function getLatest(db: Database.Database): PingResult[] {
  const rows = db
    .prepare(
      `
    SELECT m.* FROM monitor_pings m
    INNER JOIN (
      SELECT provider_id, model_name, MAX(checked_at) as max_at
      FROM monitor_pings GROUP BY provider_id, model_name
    ) latest ON m.provider_id = latest.provider_id
            AND m.model_name = latest.model_name
            AND m.checked_at = latest.max_at
    ORDER BY m.provider_name, m.model_name
  `,
    )
    .all() as any[];
  return rows.map(mapRow);
}

function getRecent(db: Database.Database, hours: number = 24): PingResult[] {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const rows = db
    .prepare(
      `
    SELECT * FROM monitor_pings WHERE checked_at > ? ORDER BY checked_at ASC
  `,
    )
    .all(since) as any[];
  return rows.map(mapRow);
}

function cleanup(db: Database.Database, days: number = 7): void {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM monitor_pings WHERE checked_at < ?').run(cutoff);
}

const basePing: Omit<PingResult, 'id'> = {
  providerId: 'p1',
  providerName: 'TestProvider',
  modelName: 'gpt-4',
  status: 'ok',
  healthStatus: 'healthy',
  latencyMs: 500,
  ttftMs: 100,
  outputTokens: 50,
  checkedAt: new Date().toISOString(),
};

describe('MonitorStore', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('inserts and retrieves a ping', () => {
    insertPing(db, basePing);
    const latest = getLatest(db);
    expect(latest).toHaveLength(1);
    expect(latest[0].providerId).toBe('p1');
    expect(latest[0].modelName).toBe('gpt-4');
    expect(latest[0].latencyMs).toBe(500);
  });

  it('getLatest returns only the most recent ping per model', () => {
    insertPing(db, { ...basePing, checkedAt: '2026-04-10T10:00:00.000Z', latencyMs: 300 });
    insertPing(db, { ...basePing, checkedAt: '2026-04-10T11:00:00.000Z', latencyMs: 600 });
    const latest = getLatest(db);
    expect(latest).toHaveLength(1);
    expect(latest[0].latencyMs).toBe(600);
  });

  it('getRecent filters by time window', () => {
    const now = Date.now();
    insertPing(db, { ...basePing, checkedAt: new Date(now - 2 * 3600 * 1000).toISOString() });
    insertPing(db, { ...basePing, checkedAt: new Date(now - 30 * 3600 * 1000).toISOString() });
    const recent = getRecent(db, 24);
    expect(recent).toHaveLength(1);
  });

  it('cleanup removes old pings', () => {
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    insertPing(db, { ...basePing, checkedAt: old });
    insertPing(db, { ...basePing, checkedAt: new Date().toISOString() });
    cleanup(db, 7);
    const all = db.prepare('SELECT COUNT(*) as cnt FROM monitor_pings').get() as any;
    expect(all.cnt).toBe(1);
  });

  it('handles error pings with error message', () => {
    insertPing(db, { ...basePing, status: 'error', healthStatus: 'down', errorMessage: 'timeout' });
    const latest = getLatest(db);
    expect(latest[0].status).toBe('error');
    expect(latest[0].errorMessage).toBe('timeout');
  });

  it('handles multiple providers and models', () => {
    insertPing(db, { ...basePing, providerId: 'p1', modelName: 'gpt-4' });
    insertPing(db, { ...basePing, providerId: 'p1', modelName: 'gpt-3.5' });
    insertPing(db, { ...basePing, providerId: 'p2', providerName: 'Provider2', modelName: 'claude-3' });
    const latest = getLatest(db);
    expect(latest).toHaveLength(3);
  });
});

import Database from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '../../data/benchmarks.db');

export type HealthStatus = 'healthy' | 'slow' | 'very_slow' | 'down';

export interface PingResult {
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

class MonitorStore {
  private db: Database.Database | null = null;

  constructor() {
    this.initDatabase();
  }

  private initDatabase() {
    try {
      const fs = require('fs');
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(DB_PATH);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS monitor_pings (
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

      // Migrations: add columns if missing (older table)
      try {
        this.db.exec('ALTER TABLE monitor_pings ADD COLUMN ttft_ms INTEGER NOT NULL DEFAULT 0');
      } catch {
        /* exists */
      }
      try {
        this.db.exec('ALTER TABLE monitor_pings ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0');
      } catch {
        /* exists */
      }
      try {
        this.db.exec('ALTER TABLE monitor_pings ADD COLUMN response_text TEXT');
      } catch {
        /* exists */
      }
      try {
        this.db.exec("ALTER TABLE monitor_pings ADD COLUMN health_status TEXT NOT NULL DEFAULT 'down'");
      } catch {
        /* exists */
      }

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_monitor_checked_at
        ON monitor_pings(checked_at DESC)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_monitor_provider_model
        ON monitor_pings(provider_id, model_name, checked_at DESC)
      `);

      console.log('Monitor store initialized');
    } catch (err) {
      console.error('Failed to initialize monitor store:', err);
    }
  }

  insertPing(ping: Omit<PingResult, 'id'>): void {
    if (!this.db) return;
    this.db
      .prepare(
        `
      INSERT INTO monitor_pings (provider_id, provider_name, model_name, status, health_status, latency_ms, ttft_ms, output_tokens, response_text, error_message, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
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

  /** Get the latest ping for each provider+model combination */
  getLatest(): PingResult[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `
      SELECT m.* FROM monitor_pings m
      INNER JOIN (
        SELECT provider_id, model_name, MAX(checked_at) as max_at
        FROM monitor_pings
        GROUP BY provider_id, model_name
      ) latest ON m.provider_id = latest.provider_id
              AND m.model_name = latest.model_name
              AND m.checked_at = latest.max_at
      ORDER BY m.provider_name, m.model_name
    `,
      )
      .all() as any[];
    return rows.map(mapRow);
  }

  /** Get recent pings for the last N hours */
  getRecent(hours: number = 24): PingResult[] {
    if (!this.db) return [];
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const rows = this.db
      .prepare(
        `
      SELECT * FROM monitor_pings
      WHERE checked_at > ?
      ORDER BY checked_at ASC
    `,
      )
      .all(since) as any[];
    return rows.map(mapRow);
  }

  /** Recalculate health_status for all rows based on current thresholds */
  backfillHealthStatus(
    classify: (status: string, latencyMs: number, ttftMs: number, outputTokens: number) => HealthStatus,
  ): void {
    if (!this.db) return;
    const rows = this.db
      .prepare('SELECT id, status, health_status, latency_ms, ttft_ms, output_tokens FROM monitor_pings')
      .all() as any[];
    if (rows.length === 0) return;
    let updated = 0;
    const stmt = this.db.prepare('UPDATE monitor_pings SET health_status = ? WHERE id = ?');
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        const hs = classify(row.status, row.latency_ms, row.ttft_ms || 0, row.output_tokens || 0);
        if (hs !== row.health_status) {
          stmt.run(hs, row.id);
          updated++;
        }
      }
    });
    tx();
    if (updated > 0) console.log(`[Monitor] Recalculated health_status: ${updated} of ${rows.length} pings updated`);
  }

  /** Clean up pings older than N days */
  cleanup(days: number = 7): void {
    if (!this.db) return;
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    this.db.prepare('DELETE FROM monitor_pings WHERE checked_at < ?').run(cutoff);
  }
}

export const monitorStore = new MonitorStore();

import Database from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '../../data/benchmarks.db');

export interface MonitorTarget {
  providerId: string;
  modelName: string;
  providerName: string;
  intervalMinutes: number; // 0 = use global default
}

export interface HealthThresholds {
  latencySlowMs: number;     // default 2000
  latencyVerySlowMs: number; // default 5000
  ttftSlowMs: number;        // default 1000
  minOutputTokens: number;   // default 1
}

export interface MonitorGlobalConfig {
  defaultIntervalMinutes: number; // 5–360
  healthThresholds: HealthThresholds;
}

const DEFAULT_CONFIG: MonitorGlobalConfig = {
  defaultIntervalMinutes: 10,
  healthThresholds: {
    latencySlowMs: 2000,
    latencyVerySlowMs: 5000,
    ttftSlowMs: 1000,
    minOutputTokens: 1,
  },
};

class MonitorConfigStore {
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
        CREATE TABLE IF NOT EXISTS monitor_targets (
          provider_id TEXT NOT NULL,
          model_name TEXT NOT NULL,
          provider_name TEXT NOT NULL,
          interval_minutes INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (provider_id, model_name)
        )
      `);

      // Migration: add interval_minutes column if missing (older table)
      try {
        this.db.exec('ALTER TABLE monitor_targets ADD COLUMN interval_minutes INTEGER NOT NULL DEFAULT 0');
      } catch { /* column already exists, ignore */ }

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS monitor_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      console.log('Monitor config store initialized');
    } catch (err) {
      console.error('Failed to initialize monitor config store:', err);
    }
  }

  // ---- Global Config ----

  getConfig(): MonitorGlobalConfig {
    if (!this.db) return DEFAULT_CONFIG;
    const row = this.db.prepare("SELECT value FROM monitor_config WHERE key = 'global'").get() as any;
    if (!row) return DEFAULT_CONFIG;
    try {
      const parsed = JSON.parse(row.value);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        healthThresholds: { ...DEFAULT_CONFIG.healthThresholds, ...(parsed.healthThresholds || {}) },
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  setConfig(config: MonitorGlobalConfig): void {
    if (!this.db) return;
    const clamped = clampInterval(config.defaultIntervalMinutes);
    this.db.prepare(
      "INSERT OR REPLACE INTO monitor_config (key, value) VALUES ('global', ?)"
    ).run(JSON.stringify({
      defaultIntervalMinutes: clamped,
      healthThresholds: { ...DEFAULT_CONFIG.healthThresholds, ...(config.healthThresholds || {}) },
    }));
  }

  // ---- Targets ----

  getTargets(): MonitorTarget[] {
    if (!this.db) return [];
    const rows = this.db.prepare(
      'SELECT provider_id, model_name, provider_name, interval_minutes FROM monitor_targets WHERE enabled = 1 ORDER BY provider_name, model_name'
    ).all() as any[];
    return rows.map(r => ({
      providerId: r.provider_id,
      modelName: r.model_name,
      providerName: r.provider_name,
      intervalMinutes: r.interval_minutes || 0,
    }));
  }

  setTargets(targets: MonitorTarget[]): void {
    if (!this.db) return;
    const tx = this.db.transaction(() => {
      this.db!.prepare('DELETE FROM monitor_targets').run();
      const stmt = this.db!.prepare(
        'INSERT INTO monitor_targets (provider_id, model_name, provider_name, interval_minutes, enabled) VALUES (?, ?, ?, ?, 1)'
      );
      for (const t of targets) {
        stmt.run(t.providerId, t.modelName, t.providerName, t.intervalMinutes || 0);
      }
    });
    tx();
  }

  addTarget(target: MonitorTarget): void {
    if (!this.db) return;
    this.db.prepare(
      'INSERT OR REPLACE INTO monitor_targets (provider_id, model_name, provider_name, interval_minutes, enabled) VALUES (?, ?, ?, ?, 1)'
    ).run(target.providerId, target.modelName, target.providerName, target.intervalMinutes || 0);
  }

  removeTarget(providerId: string, modelName: string): void {
    if (!this.db) return;
    this.db.prepare(
      'DELETE FROM monitor_targets WHERE provider_id = ? AND model_name = ?'
    ).run(providerId, modelName);
  }
}

function clampInterval(minutes: number): number {
  return Math.max(5, Math.min(360, minutes));
}

export { clampInterval };
export const monitorConfigStore = new MonitorConfigStore();

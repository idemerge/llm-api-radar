import { getDb } from './database';

export interface MonitorTarget {
  providerId: string;
  modelName: string;
  providerName: string;
  intervalMinutes: number; // 0 = use global default
}

export interface HealthThresholds {
  tpsSlowThreshold: number; // default 20 — below this is 'slow'
  tpsVerySlowThreshold: number; // default 5  — below this is 'very_slow'
  ttftSlowMs: number; // default 1000
  minOutputTokens: number; // default 1
}

export interface MonitorGlobalConfig {
  defaultIntervalMinutes: number; // 5–360
  healthThresholds: HealthThresholds;
}

const DEFAULT_CONFIG: MonitorGlobalConfig = {
  defaultIntervalMinutes: 10,
  healthThresholds: {
    tpsSlowThreshold: 20,
    tpsVerySlowThreshold: 5,
    ttftSlowMs: 1000,
    minOutputTokens: 1,
  },
};

class MonitorConfigStore {
  private db = getDb();

  constructor() {
    this.initDatabase();
  }

  private initDatabase() {
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

    // Migration: add interval_minutes column if missing using PRAGMA check
    const cols = (this.db.pragma('table_info(monitor_targets)') as Array<{ name: string }>).map((c) => c.name);
    if (!cols.includes('interval_minutes')) {
      this.db.exec('ALTER TABLE monitor_targets ADD COLUMN interval_minutes INTEGER NOT NULL DEFAULT 0');
      console.log('Migrated: added interval_minutes column to monitor_targets');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitor_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    console.log('Monitor config store initialized');
  }

  // ---- Global Config ----

  getConfig(): MonitorGlobalConfig {
    const row = this.db.prepare("SELECT value FROM monitor_config WHERE key = 'global'").get() as
      | { value: string }
      | undefined;
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
    const clamped = clampInterval(config.defaultIntervalMinutes);
    this.db.prepare("INSERT OR REPLACE INTO monitor_config (key, value) VALUES ('global', ?)").run(
      JSON.stringify({
        defaultIntervalMinutes: clamped,
        healthThresholds: { ...DEFAULT_CONFIG.healthThresholds, ...(config.healthThresholds || {}) },
      }),
    );
  }

  // ---- Targets ----

  getTargets(): MonitorTarget[] {
    const rows = this.db
      .prepare(
        'SELECT provider_id, model_name, provider_name, interval_minutes FROM monitor_targets WHERE enabled = 1 ORDER BY provider_name, model_name',
      )
      .all() as Array<{
      provider_id: string;
      model_name: string;
      provider_name: string;
      interval_minutes: number;
    }>;
    return rows.map((r) => ({
      providerId: r.provider_id,
      modelName: r.model_name,
      providerName: r.provider_name,
      intervalMinutes: r.interval_minutes || 0,
    }));
  }

  setTargets(targets: MonitorTarget[]): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM monitor_targets').run();
      const stmt = this.db.prepare(
        'INSERT INTO monitor_targets (provider_id, model_name, provider_name, interval_minutes, enabled) VALUES (?, ?, ?, ?, 1)',
      );
      for (const t of targets) {
        stmt.run(t.providerId, t.modelName, t.providerName, t.intervalMinutes || 0);
      }
    });
    tx();
  }

  addTarget(target: MonitorTarget): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO monitor_targets (provider_id, model_name, provider_name, interval_minutes, enabled) VALUES (?, ?, ?, ?, 1)',
      )
      .run(target.providerId, target.modelName, target.providerName, target.intervalMinutes || 0);
  }

  removeTarget(providerId: string, modelName: string): void {
    this.db.prepare('DELETE FROM monitor_targets WHERE provider_id = ? AND model_name = ?').run(providerId, modelName);
  }

  /** Rename a target's model name (preserves interval and enabled state) */
  renameTarget(providerId: string, oldModelName: string, newModelName: string): void {
    this.db
      .prepare('UPDATE monitor_targets SET model_name = ? WHERE provider_id = ? AND model_name = ?')
      .run(newModelName, providerId, oldModelName);
  }

  /** Remove all targets for a given provider */
  removeTargetsByProvider(providerId: string): void {
    this.db.prepare('DELETE FROM monitor_targets WHERE provider_id = ?').run(providerId);
  }
}

function clampInterval(minutes: number): number {
  return Math.max(5, Math.min(360, minutes));
}

export { clampInterval };
export const monitorConfigStore = new MonitorConfigStore();

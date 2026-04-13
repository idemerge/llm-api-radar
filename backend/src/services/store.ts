import { BenchmarkRun } from '../types';
import { getDb } from './database';

class BenchmarkStore {
  private runs: Map<string, BenchmarkRun> = new Map();
  private db = getDb();

  constructor() {
    this.initDatabase();
    this.load();
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS benchmarks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        providers TEXT NOT NULL,
        config TEXT NOT NULL,
        results TEXT NOT NULL,
        capability_tests TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    console.log('Benchmark store initialized');
  }

  private load() {
    try {
      const rows = this.db.prepare('SELECT * FROM benchmarks ORDER BY created_at DESC').all() as Array<{
        id: string;
        status: string;
        providers: string;
        config: string;
        results: string;
        capability_tests: string | null;
        created_at: string;
        completed_at: string | null;
      }>;
      for (const row of rows) {
        this.runs.set(row.id, {
          id: row.id,
          status: row.status as BenchmarkRun['status'],
          providers: JSON.parse(row.providers),
          config: JSON.parse(row.config),
          results: JSON.parse(row.results),
          capabilityTests: row.capability_tests ? JSON.parse(row.capability_tests) : undefined,
          createdAt: row.created_at,
          completedAt: row.completed_at || undefined,
        });
      }
      console.log(`Loaded ${this.runs.size} benchmark(s) from SQLite`);
    } catch (err) {
      console.error('Failed to load from SQLite:', err);
    }
  }

  create(run: BenchmarkRun): BenchmarkRun {
    this.db
      .prepare(
        `
        INSERT INTO benchmarks (id, status, providers, config, results, capability_tests, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.id,
        run.status,
        JSON.stringify(run.providers),
        JSON.stringify(run.config),
        JSON.stringify(run.results),
        run.capabilityTests ? JSON.stringify(run.capabilityTests) : null,
        run.createdAt,
        run.completedAt || null,
      );

    this.runs.set(run.id, run);
    return run;
  }

  get(id: string): BenchmarkRun | undefined {
    return this.runs.get(id);
  }

  getAll(): BenchmarkRun[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  update(id: string, updates: Partial<BenchmarkRun>): BenchmarkRun | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const updated = { ...run, ...updates };

    this.db
      .prepare(
        `
        UPDATE benchmarks
        SET status = ?, results = ?, capability_tests = ?, completed_at = ?
        WHERE id = ?
      `,
      )
      .run(
        updated.status,
        JSON.stringify(updated.results),
        updated.capabilityTests ? JSON.stringify(updated.capabilityTests) : null,
        updated.completedAt || null,
        id,
      );

    this.runs.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    // SQLite-first: delete from DB first, then Map on success
    this.db.prepare('DELETE FROM benchmarks WHERE id = ?').run(id);
    const result = this.runs.delete(id);
    return result;
  }
}

export const store = new BenchmarkStore();

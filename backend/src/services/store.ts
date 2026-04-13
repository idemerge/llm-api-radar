import { BenchmarkRun, CapabilityTest } from '../types';
import Database from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '../../data/benchmarks.db');

class BenchmarkStore {
  private runs: Map<string, BenchmarkRun> = new Map();
  private db: Database.Database | null = null;

  constructor() {
    this.initDatabase();
    this.load();
  }

  private initDatabase() {
    try {
      const dir = path.dirname(DB_PATH);
      if (!require('fs').existsSync(dir)) {
        require('fs').mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(DB_PATH);

      // Create table
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

      console.log('SQLite database initialized');
    } catch (err) {
      console.error('Failed to initialize SQLite:', err);
      // Fallback to file storage
    }
  }

  private load() {
    // Load from SQLite first
    if (this.db) {
      try {
        const rows = this.db!.prepare('SELECT * FROM benchmarks ORDER BY created_at DESC').all() as any[];
        for (const row of rows) {
          this.runs.set(row.id, {
            id: row.id,
            status: row.status,
            providers: JSON.parse(row.providers),
            config: JSON.parse(row.config),
            results: JSON.parse(row.results),
            capabilityTests: row.capability_tests ? JSON.parse(row.capability_tests) : undefined,
            createdAt: row.created_at,
            completedAt: row.completed_at || undefined,
          });
        }
        console.log(`Loaded ${this.runs.size} benchmark(s) from SQLite`);
        return;
      } catch (err) {
        console.error('Failed to load from SQLite:', err);
      }
    }

    // Fallback: load from file
    this.loadFromFile();
  }

  private loadFromFile() {
    const fs = require('fs');
    const DATA_FILE = path.join(__dirname, '../../data/benchmarks.json');
    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        for (const run of data) {
          this.runs.set(run.id, run);
        }
        console.log(`Loaded ${this.runs.size} benchmark(s) from file`);
      }
    } catch (err) {
      console.error('Failed to load benchmarks:', err);
    }
  }

  private save() {
    if (this.db) {
      // SQLite persistence is handled in create/update methods
      return;
    }

    // Fallback: save to file
    const fs = require('fs');
    const DATA_FILE = path.join(__dirname, '../../data/benchmarks.json');
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.runs.values());
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save benchmarks:', err);
    }
  }

  create(run: BenchmarkRun): BenchmarkRun {
    this.runs.set(run.id, run);

    if (this.db) {
      try {
        this.db!.prepare(
          `
          INSERT INTO benchmarks (id, status, providers, config, results, capability_tests, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          run.id,
          run.status,
          JSON.stringify(run.providers),
          JSON.stringify(run.config),
          JSON.stringify(run.results),
          run.capabilityTests ? JSON.stringify(run.capabilityTests) : null,
          run.createdAt,
          run.completedAt || null,
        );
      } catch (err) {
        console.error('Failed to save to SQLite:', err);
        this.save(); // Fallback to file
      }
    } else {
      this.save();
    }

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
    this.runs.set(id, updated);

    if (this.db) {
      try {
        this.db!.prepare(
          `
          UPDATE benchmarks 
          SET status = ?, results = ?, capability_tests = ?, completed_at = ?
          WHERE id = ?
        `,
        ).run(
          updated.status,
          JSON.stringify(updated.results),
          updated.capabilityTests ? JSON.stringify(updated.capabilityTests) : null,
          updated.completedAt || null,
          id,
        );
      } catch (err) {
        console.error('Failed to update SQLite:', err);
        this.save(); // Fallback to file
      }
    } else {
      this.save();
    }

    return updated;
  }

  delete(id: string): boolean {
    const result = this.runs.delete(id);
    if (result) {
      if (this.db) {
        try {
          this.db!.prepare('DELETE FROM benchmarks WHERE id = ?').run(id);
        } catch (err) {
          console.error('Failed to delete from SQLite:', err);
        }
      }
      this.save();
    }
    return result;
  }
}

export const store = new BenchmarkStore();

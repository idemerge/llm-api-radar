import { BenchmarkRun } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const DATA_FILE = path.join(__dirname, '../../data/benchmarks.json');

class BenchmarkStore {
  private runs: Map<string, BenchmarkRun> = new Map();

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        for (const run of data) {
          this.runs.set(run.id, run);
        }
        console.log(`Loaded ${this.runs.size} benchmark(s) from storage`);
      }
    } catch (err) {
      console.error('Failed to load benchmarks:', err);
    }
  }

  private save() {
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
    this.save();
    return run;
  }

  get(id: string): BenchmarkRun | undefined {
    return this.runs.get(id);
  }

  getAll(): BenchmarkRun[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  update(id: string, updates: Partial<BenchmarkRun>): BenchmarkRun | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const updated = { ...run, ...updates };
    this.runs.set(id, updated);
    this.save();
    return updated;
  }

  delete(id: string): boolean {
    const result = this.runs.delete(id);
    if (result) this.save();
    return result;
  }
}

export const store = new BenchmarkStore();

import { BenchmarkWorkflow } from '../types';
import Database from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '../../data/benchmarks.db');

class WorkflowStore {
  private workflows: Map<string, BenchmarkWorkflow> = new Map();
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

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          providers TEXT NOT NULL,
          provider_labels TEXT,
          tasks TEXT NOT NULL,
          options TEXT NOT NULL,
          task_results TEXT NOT NULL DEFAULT '[]',
          summary TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        )
      `);

      // Migrate: add provider_labels column if missing
      const cols = (this.db.pragma('table_info(workflows)') as any[]).map((c: any) => c.name);
      if (!cols.includes('provider_labels')) {
        this.db.exec('ALTER TABLE workflows ADD COLUMN provider_labels TEXT');
        console.log('Migrated: added provider_labels column');
      }

      // Create indexes if they don't exist
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
        CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);
      `);

      console.log('Workflow store initialized');
    } catch (err) {
      console.error('Failed to initialize workflow store:', err);
    }
  }

  private load() {
    if (!this.db) return;

    try {
      const rows = this.db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all() as any[];
      for (const row of rows) {
        this.workflows.set(row.id, {
          id: row.id,
          name: row.name,
          description: row.description || undefined,
          status: row.status,
          providers: JSON.parse(row.providers),
          providerLabels: row.provider_labels ? JSON.parse(row.provider_labels) : undefined,
          tasks: JSON.parse(row.tasks),
          options: JSON.parse(row.options),
          taskResults: JSON.parse(row.task_results),
          summary: row.summary ? JSON.parse(row.summary) : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          startedAt: row.started_at || undefined,
          completedAt: row.completed_at || undefined,
        });
      }
      console.log(`Loaded ${this.workflows.size} workflow(s) from SQLite`);

      // Mark stale running workflows as failed (backend was restarted mid-execution)
      let staleCount = 0;
      for (const [id, wf] of this.workflows) {
        if (wf.status === 'running') {
          // Also fix stale taskResult statuses
          const fixedTaskResults = wf.taskResults.map(tr =>
            tr.status === 'running' || tr.status === 'pending'
              ? { ...tr, status: 'failed' as const }
              : tr
          );
          this.update(id, {
            status: 'failed',
            taskResults: fixedTaskResults,
            completedAt: new Date().toISOString(),
          });
          staleCount++;
        }
      }
      if (staleCount > 0) {
        console.log(`Marked ${staleCount} stale running workflow(s) as failed`);
      }
    } catch (err) {
      console.error('Failed to load workflows:', err);
    }
  }

  create(workflow: BenchmarkWorkflow): BenchmarkWorkflow {
    this.workflows.set(workflow.id, workflow);

    if (this.db) {
      try {
        this.db.prepare(`
          INSERT INTO workflows (id, name, description, status, providers, provider_labels, tasks, options, task_results, summary, created_at, updated_at, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          workflow.id,
          workflow.name,
          workflow.description || null,
          workflow.status,
          JSON.stringify(workflow.providers),
          workflow.providerLabels ? JSON.stringify(workflow.providerLabels) : null,
          JSON.stringify(workflow.tasks),
          JSON.stringify(workflow.options),
          JSON.stringify(workflow.taskResults),
          workflow.summary ? JSON.stringify(workflow.summary) : null,
          workflow.createdAt,
          workflow.updatedAt,
          workflow.startedAt || null,
          workflow.completedAt || null
        );
      } catch (err) {
        console.error('Failed to save workflow to SQLite:', err);
      }
    }

    return workflow;
  }

  get(id: string): BenchmarkWorkflow | undefined {
    return this.workflows.get(id);
  }

  getAll(): BenchmarkWorkflow[] {
    return Array.from(this.workflows.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  update(id: string, updates: Partial<BenchmarkWorkflow>): BenchmarkWorkflow | undefined {
    const workflow = this.workflows.get(id);
    if (!workflow) return undefined;

    const updated = { ...workflow, ...updates, updatedAt: new Date().toISOString() };
    this.workflows.set(id, updated);

    if (this.db) {
      try {
        this.db.prepare(`
          UPDATE workflows
          SET name = ?, description = ?, status = ?, providers = ?, provider_labels = ?,
              tasks = ?, options = ?, task_results = ?, summary = ?, updated_at = ?,
              started_at = ?, completed_at = ?
          WHERE id = ?
        `).run(
          updated.name,
          updated.description || null,
          updated.status,
          JSON.stringify(updated.providers),
          updated.providerLabels ? JSON.stringify(updated.providerLabels) : null,
          JSON.stringify(updated.tasks),
          JSON.stringify(updated.options),
          JSON.stringify(updated.taskResults),
          updated.summary ? JSON.stringify(updated.summary) : null,
          updated.updatedAt,
          updated.startedAt || null,
          updated.completedAt || null,
          id
        );
      } catch (err) {
        console.error('Failed to update workflow in SQLite:', err);
      }
    }

    return updated;
  }

  delete(id: string): boolean {
    const result = this.workflows.delete(id);
    if (result && this.db) {
      try {
        this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
      } catch (err) {
        console.error('Failed to delete workflow from SQLite:', err);
      }
    }
    return result;
  }
}

export const workflowStore = new WorkflowStore();

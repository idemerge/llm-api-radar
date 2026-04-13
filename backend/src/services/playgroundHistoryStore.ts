import Database from 'better-sqlite3';
import * as path from 'path';
import { randomUUID } from 'crypto';

const DB_PATH = path.join(__dirname, '../../data/benchmarks.db');

export interface PlaygroundHistoryEntry {
  id: string;
  providerId: string;
  providerName: string;
  modelName: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  useStreaming: boolean;
  enableThinking: boolean;
  responseText?: string;
  reasoningText?: string;
  metrics?: Record<string, any>;
  error?: string;
  createdAt: string;
}

export interface PlaygroundHistoryListItem {
  id: string;
  providerName: string;
  providerId: string;
  modelName: string;
  promptSnippet: string;
  createdAt: string;
  responseTime?: number;
  error?: string;
}

class PlaygroundHistoryStore {
  private entries: Map<string, PlaygroundHistoryEntry> = new Map();
  private db: Database.Database | null = null;

  constructor() {
    this.initDatabase();
    this.load();
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
        CREATE TABLE IF NOT EXISTS playground_history (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          provider_name TEXT NOT NULL,
          model_name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          system_prompt TEXT,
          max_tokens INTEGER NOT NULL,
          use_streaming INTEGER NOT NULL DEFAULT 1,
          enable_thinking INTEGER NOT NULL DEFAULT 0,
          response_text TEXT,
          reasoning_text TEXT,
          metrics TEXT,
          error TEXT,
          created_at TEXT NOT NULL
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ph_created_at ON playground_history(created_at DESC);
      `);

      console.log('Playground history store initialized');
    } catch (err) {
      console.error('Failed to initialize playground history store:', err);
    }
  }

  private load() {
    if (!this.db) return;
    try {
      const rows = this.db.prepare('SELECT * FROM playground_history ORDER BY created_at DESC').all() as any[];
      for (const row of rows) {
        const entry: PlaygroundHistoryEntry = {
          id: row.id,
          providerId: row.provider_id,
          providerName: row.provider_name,
          modelName: row.model_name,
          prompt: row.prompt,
          systemPrompt: row.system_prompt || undefined,
          maxTokens: row.max_tokens,
          useStreaming: !!row.use_streaming,
          enableThinking: !!row.enable_thinking,
          responseText: row.response_text || undefined,
          reasoningText: row.reasoning_text || undefined,
          metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
          error: row.error || undefined,
          createdAt: row.created_at,
        };
        this.entries.set(entry.id, entry);
      }
      console.log(`Loaded ${this.entries.size} playground history entries`);
    } catch (err) {
      console.error('Failed to load playground history:', err);
    }
  }

  create(data: Omit<PlaygroundHistoryEntry, 'id' | 'createdAt'>): PlaygroundHistoryEntry {
    const entry: PlaygroundHistoryEntry = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.entries.set(entry.id, entry);

    if (this.db) {
      try {
        this.db
          .prepare(
            `
          INSERT INTO playground_history (id, provider_id, provider_name, model_name, prompt, system_prompt, max_tokens, use_streaming, enable_thinking, response_text, reasoning_text, metrics, error, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            entry.id,
            entry.providerId,
            entry.providerName,
            entry.modelName,
            entry.prompt,
            entry.systemPrompt || null,
            entry.maxTokens,
            entry.useStreaming ? 1 : 0,
            entry.enableThinking ? 1 : 0,
            entry.responseText || null,
            entry.reasoningText || null,
            entry.metrics ? JSON.stringify(entry.metrics) : null,
            entry.error || null,
            entry.createdAt,
          );
      } catch (err) {
        console.error('Failed to save playground history entry:', err);
      }
    }
    return entry;
  }

  get(id: string): PlaygroundHistoryEntry | undefined {
    return this.entries.get(id);
  }

  getList(): PlaygroundHistoryListItem[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({
        id: e.id,
        providerName: e.providerName,
        providerId: e.providerId,
        modelName: e.modelName,
        promptSnippet: e.prompt.slice(0, 80),
        createdAt: e.createdAt,
        responseTime: e.metrics?.responseTime,
        error: e.error,
      }));
  }

  delete(id: string): boolean {
    const existed = this.entries.delete(id);
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM playground_history WHERE id = ?').run(id);
      } catch {
        /* ignore */
      }
    }
    return existed;
  }

  deleteAll(): void {
    this.entries.clear();
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM playground_history').run();
      } catch {
        /* ignore */
      }
    }
  }
}

export const playgroundHistoryStore = new PlaygroundHistoryStore();

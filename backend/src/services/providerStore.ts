import { ProviderConfig, ProviderConfigInput } from '../types';
import { encrypt, decrypt, maskApiKey } from '../utils/encryption';
import Database from 'better-sqlite3';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(__dirname, '../../data/benchmarks.db');

class ProviderStore {
  private db: Database.Database | null = null;
  private providers: Map<string, ProviderConfig> = new Map();

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
        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          api_key_encrypted TEXT NOT NULL,
          format TEXT NOT NULL,
          models TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      console.log('Provider store initialized');
    } catch (err) {
      console.error('Failed to initialize provider store:', err);
    }
  }

  private load() {
    if (!this.db) return;

    try {
      const rows = this.db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as any[];
      for (const row of rows) {
        this.providers.set(row.id, {
          id: row.id,
          name: row.name,
          endpoint: row.endpoint,
          apiKey: row.api_key_encrypted,
          format: row.format,
          models: JSON.parse(row.models).map((m: any) => ({
            ...m,
            supportsStreaming: m.supportsStreaming ?? true,
            isActive: m.isActive ?? true,
          })),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
      console.log(`Loaded ${this.providers.size} provider(s)`);
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  }

  create(input: ProviderConfigInput): ProviderConfig {
    const now = new Date().toISOString();
    const provider: ProviderConfig = {
      id: uuidv4(),
      name: input.name,
      endpoint: input.endpoint,
      apiKey: encrypt(input.apiKey),
      format: input.format,
      models: input.models.map((m) => ({
        ...m,
        id: m.id || uuidv4(),
        supportsStreaming: m.supportsStreaming ?? true,
        isActive: m.isActive ?? true,
      })),
      createdAt: now,
      updatedAt: now,
    };

    this.providers.set(provider.id, provider);

    if (this.db) {
      try {
        this.db
          .prepare(
            `
          INSERT INTO providers (id, name, endpoint, api_key_encrypted, format, models, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            provider.id,
            provider.name,
            provider.endpoint,
            provider.apiKey,
            provider.format,
            JSON.stringify(provider.models),
            provider.createdAt,
            provider.updatedAt,
          );
      } catch (err) {
        console.error('Failed to save provider:', err);
      }
    }

    return provider;
  }

  get(id: string): ProviderConfig | undefined {
    return this.providers.get(id);
  }

  getAll(): ProviderConfig[] {
    return Array.from(this.providers.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  update(id: string, input: Partial<ProviderConfigInput>): ProviderConfig | undefined {
    const existing = this.providers.get(id);
    if (!existing) return undefined;

    const updated: ProviderConfig = {
      ...existing,
      name: input.name ?? existing.name,
      endpoint: input.endpoint ?? existing.endpoint,
      apiKey: input.apiKey ? encrypt(input.apiKey) : existing.apiKey,
      format: input.format ?? existing.format,
      models: input.models
        ? input.models.map((m) => ({
            ...m,
            id: m.id || uuidv4(),
            supportsStreaming: m.supportsStreaming ?? true,
            isActive: m.isActive ?? true,
          }))
        : existing.models,
      updatedAt: new Date().toISOString(),
    };

    this.providers.set(id, updated);

    if (this.db) {
      try {
        this.db
          .prepare(
            `
          UPDATE providers
          SET name = ?, endpoint = ?, api_key_encrypted = ?, format = ?, models = ?, updated_at = ?
          WHERE id = ?
        `,
          )
          .run(
            updated.name,
            updated.endpoint,
            updated.apiKey,
            updated.format,
            JSON.stringify(updated.models),
            updated.updatedAt,
            id,
          );
      } catch (err) {
        console.error('Failed to update provider:', err);
      }
    }

    return updated;
  }

  delete(id: string): boolean {
    const result = this.providers.delete(id);
    if (result && this.db) {
      try {
        this.db.prepare('DELETE FROM providers WHERE id = ?').run(id);
      } catch (err) {
        console.error('Failed to delete provider:', err);
      }
    }
    return result;
  }

  getDecryptedApiKey(id: string): string | undefined {
    const provider = this.providers.get(id);
    if (!provider) return undefined;
    try {
      return decrypt(provider.apiKey);
    } catch {
      return undefined;
    }
  }

  toResponse(provider: ProviderConfig) {
    let maskedKey = '****';
    try {
      maskedKey = maskApiKey(decrypt(provider.apiKey));
    } catch {
      /* ignore */
    }

    return {
      id: provider.id,
      name: provider.name,
      endpoint: provider.endpoint,
      apiKeyMasked: maskedKey,
      format: provider.format,
      models: provider.models,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }
}

export const providerStore = new ProviderStore();

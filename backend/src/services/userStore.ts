import Database from 'better-sqlite3';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(__dirname, '../../data/benchmarks.db');

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

class UserStore {
  private db: Database.Database | null = null;

  constructor() {
    this.initDatabase();
    this.ensureAdminUser();
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
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      console.log('User store initialized');
    } catch (err) {
      console.error('Failed to initialize user store:', err);
    }
  }

  private ensureAdminUser() {
    if (!this.db) return;

    try {
      const existing = this.db.prepare('SELECT id FROM users LIMIT 1').get();
      if (!existing) {
        const username = process.env.AUTH_USERNAME || 'admin';
        const password = process.env.AUTH_PASSWORD || 'changeme';
        const hash = bcrypt.hashSync(password, 10);
        const now = new Date().toISOString();
        const id = uuidv4();

        this.db.prepare(`
          INSERT INTO users (id, username, password_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, username, hash, now, now);

        console.log(`Admin user created: ${username}`);
      }
    } catch (err) {
      console.error('Failed to ensure admin user:', err);
    }
  }

  findByUsername(username: string): UserRecord | undefined {
    if (!this.db) return undefined;
    try {
      return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRecord | undefined;
    } catch {
      return undefined;
    }
  }

  async verifyPassword(username: string, password: string): Promise<UserRecord | null> {
    const user = this.findByUsername(username);
    if (!user) return null;

    const match = await bcrypt.compare(password, user.password_hash);
    return match ? user : null;
  }

  async updatePassword(username: string, newPassword: string): Promise<boolean> {
    if (!this.db) return false;
    const user = this.findByUsername(username);
    if (!user) return false;

    try {
      const hash = bcrypt.hashSync(newPassword, 10);
      const now = new Date().toISOString();
      this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?')
        .run(hash, now, username);
      return true;
    } catch {
      return false;
    }
  }
}

export const userStore = new UserStore();

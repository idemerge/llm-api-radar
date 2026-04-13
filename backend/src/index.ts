import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from project root (works in dev, production, and Docker)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import benchmarkRoutes from './routes/benchmarks';
import workflowRoutes from './routes/workflows';
import providerRoutes from './routes/providers';
import playgroundRoutes from './routes/playground';
import monitorRoutes from './routes/monitor';
import { authPublicRouter, authProtectedRouter } from './routes/auth';
import { authMiddleware } from './middleware/auth';
import { userStore } from './services/userStore';
import { startScheduler as startMonitorScheduler } from './services/monitorScheduler';
import { needsEncryptionMigration, markEncryptionMigrated } from './utils/secrets';
import { decryptWithOldKey, encrypt } from './utils/encryption';

// Initialize user store (creates table + seeds admin)
void userStore;

// Run encryption migration synchronously before server starts
if (needsEncryptionMigration()) {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '../../data/benchmarks.db');
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath);
      const rows = db
        .prepare('SELECT id, api_key_encrypted FROM providers WHERE api_key_encrypted IS NOT NULL')
        .all() as Array<{
        id: string;
        api_key_encrypted: string;
      }>;

      if (rows.length > 0) {
        console.log(`Migrating ${rows.length} provider API keys to new encryption...`);
        const updateStmt = db.prepare('UPDATE providers SET api_key_encrypted = ? WHERE id = ?');
        const migrate = db.transaction(() => {
          let migrated = 0;
          for (const row of rows) {
            try {
              const plaintext = decryptWithOldKey(row.api_key_encrypted);
              const reEncrypted = encrypt(plaintext);
              updateStmt.run(reEncrypted, row.id);
              migrated++;
            } catch {
              console.error(`Failed to migrate API key for provider ${row.id}`);
            }
          }
          return migrated;
        });
        const count = migrate();
        console.log(`Successfully migrated ${count}/${rows.length} API keys`);
      }
      db.close();
    }
    markEncryptionMigrated();
  } catch (err) {
    console.error('Encryption migration failed:', err);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  }),
);

// CORS: restrict to configured origin, default same-origin only
const corsOrigin = process.env.CORS_ORIGIN || false;
app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(express.json({ limit: '10mb' }));

// Public routes (no auth required)
app.use('/api/auth', authPublicRouter);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes (auth required)
app.use('/api/auth', authMiddleware, authProtectedRouter);
app.use('/api/benchmarks', authMiddleware, benchmarkRoutes);
app.use('/api/workflows', authMiddleware, workflowRoutes);
app.use('/api/providers', authMiddleware, providerRoutes);
app.use('/api/playground', authMiddleware, playgroundRoutes);
app.use('/api/monitor', authMiddleware, monitorRoutes);

// SPA fallback — serve static frontend in production, otherwise index.html
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 LLM API Radar running on http://localhost:${PORT}`);

  // Start monitor scheduler
  startMonitorScheduler();
  console.log(`📊 API endpoints:`);
  console.log(`   POST   /api/auth/login            - Login`);
  console.log(`   GET    /api/auth/verify            - Verify token`);
  console.log(`   POST   /api/auth/change-password   - Change password`);
  console.log(`   POST   /api/auth/sse-token         - Get one-time SSE token`);
  console.log(`   POST   /api/benchmarks             - Start benchmark`);
  console.log(`   GET    /api/benchmarks             - List benchmarks`);
  console.log(`   GET    /api/benchmarks/:id         - Get benchmark`);
  console.log(`   GET    /api/benchmarks/:id/stream  - SSE stream`);
  console.log(`   GET    /api/benchmarks/:id/export  - Export results`);
  console.log(`   POST   /api/workflows              - Create workflow`);
  console.log(`   GET    /api/workflows              - List workflows`);
  console.log(`   GET    /api/workflows/templates     - Get templates`);
  console.log(`   GET    /api/workflows/:id          - Get workflow`);
  console.log(`   GET    /api/workflows/:id/stream   - SSE stream`);
  console.log(`   POST   /api/workflows/:id/cancel   - Cancel workflow`);
  console.log(`   GET    /api/workflows/:id/export   - Export results`);
  console.log(`   GET    /api/providers              - List providers`);
  console.log(`   POST   /api/providers              - Create provider`);
  console.log(`   PUT    /api/providers/:id          - Update provider`);
  console.log(`   DELETE /api/providers/:id          - Delete provider`);
  console.log(`   POST   /api/providers/:id/test     - Test connection`);
});

export default app;

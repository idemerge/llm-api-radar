import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (works in dev, production, and Docker)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import benchmarkRoutes from './routes/benchmarks';
import workflowRoutes from './routes/workflows';
import providerRoutes from './routes/providers';
import playgroundRoutes from './routes/playground';
import monitorRoutes from './routes/monitor';
import authRoutes from './routes/auth';
import { authMiddleware } from './middleware/auth';
import { userStore } from './services/userStore';
import { startScheduler as startMonitorScheduler } from './services/monitorScheduler';

// Initialize user store (creates table + seeds admin)
void userStore;

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes (auth required)
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
  console.log(`🚀 LLM Benchmark API running on http://localhost:${PORT}`);

  // Start monitor scheduler
  startMonitorScheduler();
  console.log(`📊 API endpoints:`);
  console.log(`   POST   /api/benchmarks            - Start benchmark`);
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

import { Router, Request, Response } from 'express';
import { monitorStore } from '../services/monitorStore';
import { monitorConfigStore, MonitorTarget, MonitorGlobalConfig } from '../services/monitorConfigStore';
import { triggerManualCheck, isCheckRunning } from '../services/monitorScheduler';

const router = Router();

// GET /api/monitor/config — Get global config
router.get('/config', (_req: Request, res: Response) => {
  const config = monitorConfigStore.getConfig();
  res.json(config);
});

// PUT /api/monitor/config — Update global config
router.put('/config', (req: Request, res: Response) => {
  const current = monitorConfigStore.getConfig();
  const body = req.body;

  // Validate and clamp interval
  const interval = typeof body.defaultIntervalMinutes === 'number'
    ? Math.max(5, Math.min(360, body.defaultIntervalMinutes))
    : current.defaultIntervalMinutes;

  // Validate health thresholds — ensure positive integers
  const ht = current.healthThresholds;
  if (body.healthThresholds && typeof body.healthThresholds === 'object') {
    const bht = body.healthThresholds;
    if (typeof bht.latencySlowMs === 'number' && bht.latencySlowMs > 0) ht.latencySlowMs = Math.round(bht.latencySlowMs);
    if (typeof bht.latencyVerySlowMs === 'number' && bht.latencyVerySlowMs > 0) ht.latencyVerySlowMs = Math.round(bht.latencyVerySlowMs);
    if (typeof bht.ttftSlowMs === 'number' && bht.ttftSlowMs > 0) ht.ttftSlowMs = Math.round(bht.ttftSlowMs);
    if (typeof bht.minOutputTokens === 'number' && bht.minOutputTokens >= 0) ht.minOutputTokens = Math.round(bht.minOutputTokens);
  }

  const updated: MonitorGlobalConfig = {
    defaultIntervalMinutes: interval,
    healthThresholds: ht,
  };
  monitorConfigStore.setConfig(updated);
  res.json({ success: true, config: monitorConfigStore.getConfig() });
});

// GET /api/monitor/targets — Get monitored targets
router.get('/targets', (_req: Request, res: Response) => {
  const targets = monitorConfigStore.getTargets();
  res.json(targets);
});

// PUT /api/monitor/targets — Replace all monitored targets
router.put('/targets', (req: Request, res: Response) => {
  const targets: MonitorTarget[] = req.body;
  if (!Array.isArray(targets)) {
    return res.status(400).json({ error: 'Expected array of targets' });
  }
  monitorConfigStore.setTargets(targets);
  res.json({ success: true });
});

// POST /api/monitor/targets — Add a single target
router.post('/targets', (req: Request, res: Response) => {
  const { providerId, modelName, providerName, intervalMinutes } = req.body;
  if (!providerId || !modelName || !providerName) {
    return res.status(400).json({ error: 'providerId, modelName, providerName required' });
  }
  monitorConfigStore.addTarget({ providerId, modelName, providerName, intervalMinutes: intervalMinutes || 0 });
  res.json({ success: true });
});

// DELETE /api/monitor/targets/:providerId/:modelName — Remove a target
router.delete('/targets/:providerId/:modelName', (req: Request, res: Response) => {
  monitorConfigStore.removeTarget(req.params.providerId, req.params.modelName);
  res.json({ success: true });
});

// GET /api/monitor/status — Latest status for each provider+model
router.get('/status', (_req: Request, res: Response) => {
  const latest = monitorStore.getLatest();
  res.json(latest);
});

// GET /api/monitor/history?hours=24 — Recent pings
router.get('/history', (req: Request, res: Response) => {
  const hours = Math.min(parseInt(req.query.hours as string) || 24, 72);
  const history = monitorStore.getRecent(hours);
  res.json(history);
});

// POST /api/monitor/run — Manual trigger
router.post('/run', async (_req: Request, res: Response) => {
  if (isCheckRunning()) {
    return res.json({ message: 'Check already in progress' });
  }

  try {
    await triggerManualCheck();
    const latest = monitorStore.getLatest();
    res.json({ success: true, results: latest });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

export default router;

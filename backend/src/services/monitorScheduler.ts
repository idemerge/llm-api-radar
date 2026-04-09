import cron, { ScheduledTask } from 'node-cron';
import { providerStore } from './providerStore';
import { monitorConfigStore, MonitorTarget } from './monitorConfigStore';
import { testProviderConnection } from '../providers/adapter';
import { monitorStore, HealthStatus } from './monitorStore';

function classifyHealth(
  status: string,
  latencyMs: number,
  ttftMs: number,
  outputTokens: number,
): HealthStatus {
  const thresholds = monitorConfigStore.getConfig().healthThresholds;
  if (status === 'error' || status === 'timeout') return 'down';
  // Only enforce minOutputTokens when streaming provides real token counts.
  // Non-streaming checks may report outputTokens=0 with a valid response.
  if (outputTokens > 0 && outputTokens < thresholds.minOutputTokens) return 'down';
  // Calculate TPS (tokens per second) for throughput-based health classification
  const tps = latencyMs > 0 ? (outputTokens / latencyMs) * 1000 : 0;
  if (tps > 0 && tps < thresholds.tpsVerySlowThreshold) return 'very_slow';
  if (tps > 0 && tps < thresholds.tpsSlowThreshold) return 'slow';
  if (ttftMs >= thresholds.ttftSlowMs) return 'slow';
  return 'healthy';
}

let scheduledTask: ScheduledTask | null = null;
let isRunning = false;

// Track last check time per target
const lastCheckMap = new Map<string, number>(); // key: "providerId::modelName", value: timestamp ms

function shouldCheck(target: MonitorTarget, now: number): boolean {
  const key = `${target.providerId}::${target.modelName}`;
  const globalConfig = monitorConfigStore.getConfig();
  const intervalMin = target.intervalMinutes || globalConfig.defaultIntervalMinutes;
  const intervalMs = intervalMin * 60 * 1000;

  const last = lastCheckMap.get(key);
  if (!last) return true; // Never checked before
  return (now - last) >= intervalMs;
}

async function probeTarget(target: MonitorTarget, isoNow: string): Promise<void> {
  const provider = providerStore.get(target.providerId);
  if (!provider) return;

  const apiKey = providerStore.getDecryptedApiKey(target.providerId);
  if (!apiKey) return;

  try {
    const result = await testProviderConnection({
      endpoint: provider.endpoint,
      apiKey,
      format: provider.format,
      modelName: target.modelName,
    });

    const pingStatus = result.success ? 'ok' : 'error';
    monitorStore.insertPing({
      providerId: target.providerId,
      providerName: target.providerName,
      modelName: target.modelName,
      status: pingStatus,
      healthStatus: classifyHealth(pingStatus, result.latencyMs, result.ttftMs, result.outputTokens),
      latencyMs: result.latencyMs,
      ttftMs: result.ttftMs,
      outputTokens: result.outputTokens,
      responseText: result.responseText,
      errorMessage: result.error || undefined,
      checkedAt: isoNow,
    });
  } catch (err: any) {
    monitorStore.insertPing({
      providerId: target.providerId,
      providerName: target.providerName,
      modelName: target.modelName,
      status: 'error',
      healthStatus: 'down',
      latencyMs: 0,
      ttftMs: 0,
      outputTokens: 0,
      errorMessage: err.message || 'Unknown error',
      checkedAt: isoNow,
    });
  }

  lastCheckMap.set(`${target.providerId}::${target.modelName}`, Date.now());
}

async function runCheck(forceAll = false) {
  if (isRunning) return;
  isRunning = true;

  try {
    const targets = monitorConfigStore.getTargets();
    if (targets.length === 0) return;

    const now = Date.now();
    const toCheck = forceAll ? targets : targets.filter(t => shouldCheck(t, now));

    if (toCheck.length === 0) return;

    const isoNow = new Date(now).toISOString();

    // Group targets by provider — run providers in parallel, models within a provider serially
    const providerGroups = new Map<string, MonitorTarget[]>();
    for (const t of toCheck) {
      if (!providerGroups.has(t.providerId)) providerGroups.set(t.providerId, []);
      providerGroups.get(t.providerId)!.push(t);
    }

    await Promise.all(
      Array.from(providerGroups.values()).map(providerTargets =>
        (async () => {
          for (const target of providerTargets) {
            await probeTarget(target, isoNow);
          }
        })()
      )
    );
  } finally {
    isRunning = false;
  }
}

export function startScheduler() {
  if (scheduledTask) return;

  // Backfill health_status for old records that defaulted to 'down'
  monitorStore.backfillHealthStatus(classifyHealth);

  // Check every minute to see which targets need probing
  scheduledTask = cron.schedule('* * * * *', () => {
    runCheck(false).catch(err => {
      console.error('[Monitor] Scheduled check failed:', err);
    });
  });

  console.log('[Monitor] Scheduler started (checks every minute, probes based on per-target interval)');

  // Initial check after startup
  setTimeout(() => {
    console.log('[Monitor] Running initial health check...');
    runCheck(true).then(() => {
      console.log('[Monitor] Initial check complete');
    }).catch(err => {
      console.error('[Monitor] Initial check failed:', err);
    });
  }, 5000);
}

export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Monitor] Scheduler stopped');
  }
}

export function triggerManualCheck() {
  return runCheck(true);
}

export function isCheckRunning() {
  return isRunning;
}

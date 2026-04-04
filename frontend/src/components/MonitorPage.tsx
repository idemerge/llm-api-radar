import { useEffect, useState, useMemo, useRef } from 'react';
import { Button, Tooltip, Checkbox, Select } from '../antdImports';
import { ReloadOutlined, ClockCircleOutlined, SettingOutlined, WarningOutlined } from '@ant-design/icons';
import { useMonitor, PingResult, MonitorTarget, HealthThresholds } from '../hooks/useMonitor';
import { useProviders } from '../hooks/useProviders';

const INTERVAL_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 360, label: '6 hours' },
];

const DEFAULT_INTERVAL_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 360, label: '6 hours' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type HealthStatus = 'healthy' | 'slow' | 'very_slow' | 'down';

function getStatusDotColor(cls: HealthStatus): string {
  if (cls === 'down') return 'bg-red-500';
  if (cls === 'very_slow') return 'bg-orange-500';
  if (cls === 'slow') return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getStatusLabel(cls: HealthStatus): string {
  if (cls === 'down') return 'Down';
  if (cls === 'very_slow') return 'Very Slow';
  if (cls === 'slow') return 'Slow';
  return 'Healthy';
}

function getStatusTextColor(cls: HealthStatus): string {
  if (cls === 'down') return 'text-red-400';
  if (cls === 'very_slow') return 'text-orange-400';
  if (cls === 'slow') return 'text-amber-400';
  return 'text-emerald-400';
}

function HistoryBar({ history, providerId, modelName }: { history: PingResult[]; providerId: string; modelName: string }) {
  const pings = history
    .filter(p => p.providerId === providerId && p.modelName === modelName)
    .slice(-144);

  if (pings.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-0.5">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="w-1.5 h-3 rounded-sm bg-white/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {pings.map((p, i) => {
        const cls = p.healthStatus;
        return (
          <Tooltip
            key={i}
            title={
              <div className="text-[11px] leading-relaxed space-y-0.5 py-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${getStatusDotColor(cls)}`} />
                  <span className="font-medium">{getStatusLabel(cls)}</span>
                  <span className="text-white/50">·</span>
                  <span className="text-white/60">{formatTime(p.checkedAt)}</span>
                </div>
                <div className="flex gap-3 text-white/70 pl-3">
                  <span>Latency <span className="text-white font-mono">{formatLatency(p.latencyMs)}</span></span>
                  <span>TTFT <span className="text-white font-mono">{formatLatency(p.ttftMs)}</span></span>
                </div>
                {p.outputTokens > 0 && (
                  <div className="text-white/70 pl-3">
                    Tokens <span className="text-white font-mono">{p.outputTokens}</span>
                  </div>
                )}
                {p.errorMessage && (
                  <div className="text-red-300 pl-3 truncate max-w-[240px]">{p.errorMessage}</div>
                )}
              </div>
            }
          >
            <div className={`w-1.5 h-3 rounded-sm ${getStatusDotColor(cls)}`} />
          </Tooltip>
        );
      })}
    </div>
  );
}

export function MonitorPage() {
  const { statuses, history, targets, globalConfig, running, fetchAll, saveTargets, saveConfig, triggerRun } = useMonitor();
  const { providers, fetchProviders } = useProviders();
  const [lastChecked, setLastChecked] = useState<string>('');
  const [showConfig, setShowConfig] = useState(false);
  const [draftInterval, setDraftInterval] = useState(globalConfig.defaultIntervalMinutes);
  const [thresholdTexts, setThresholdTexts] = useState<Record<keyof HealthThresholds, string>>({
    latencySlowMs: String(globalConfig.healthThresholds.latencySlowMs),
    latencyVerySlowMs: String(globalConfig.healthThresholds.latencyVerySlowMs),
    ttftSlowMs: String(globalConfig.healthThresholds.ttftSlowMs),
    minOutputTokens: String(globalConfig.healthThresholds.minOutputTokens),
  });
  const [draftTargets, setDraftTargets] = useState<MonitorTarget[]>(targets);
  const [configDirty, setConfigDirty] = useState(false);

  // Sync draft when backend data changes
  useEffect(() => {
    setDraftInterval(globalConfig.defaultIntervalMinutes);
    setThresholdTexts({
      latencySlowMs: String(globalConfig.healthThresholds.latencySlowMs),
      latencyVerySlowMs: String(globalConfig.healthThresholds.latencyVerySlowMs),
      ttftSlowMs: String(globalConfig.healthThresholds.ttftSlowMs),
      minOutputTokens: String(globalConfig.healthThresholds.minOutputTokens),
    });
  }, [globalConfig]);

  useEffect(() => {
    setDraftTargets(targets);
  }, [targets]);

  // Reset dirty when all drafts match saved state
  useEffect(() => {
    const intervalChanged = draftInterval !== globalConfig.defaultIntervalMinutes;
    const thresholdsChanged = Object.keys(thresholdTexts).some(
      k => thresholdTexts[k as keyof HealthThresholds] !== String(globalConfig.healthThresholds[k as keyof HealthThresholds])
    );
    const targetsChanged = JSON.stringify(draftTargets) !== JSON.stringify(targets);
    setConfigDirty(intervalChanged || thresholdsChanged || targetsChanged);
  }, [draftInterval, thresholdTexts, draftTargets, globalConfig, targets]);

  const handleSaveAll = () => {
    const parsedThresholds: HealthThresholds = {
      latencySlowMs: parseInt(thresholdTexts.latencySlowMs) || 2000,
      latencyVerySlowMs: parseInt(thresholdTexts.latencyVerySlowMs) || 5000,
      ttftSlowMs: parseInt(thresholdTexts.ttftSlowMs) || 1000,
      minOutputTokens: parseInt(thresholdTexts.minOutputTokens) || 1,
    };
    saveConfig({
      defaultIntervalMinutes: draftInterval,
      healthThresholds: parsedThresholds,
    });
    saveTargets(draftTargets);
  };
  const refreshRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    fetchProviders();
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 60 seconds
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      fetchAll();
    }, 60000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchAll]);

  useEffect(() => {
    if (statuses.length > 0) {
      const latestTime = statuses.reduce((latest, s) =>
        s.checkedAt > latest ? s.checkedAt : latest, statuses[0].checkedAt);
      setLastChecked(latestTime);
    }
  }, [statuses]);

  const thresholds = globalConfig.healthThresholds;

  // Summary stats — only count statuses that match current targets
  const summary = useMemo(() => {
    const totalModels = targets.length;
    const providerCount = new Set(targets.map(t => t.providerId)).size;
    const targetKeys = new Set(targets.map(t => `${t.providerId}::${t.modelName}`));
    const targetStatuses = statuses.filter(s => targetKeys.has(`${s.providerId}::${s.modelName}`));
    let healthyCount = 0;
    let slowCount = 0;
    let verySlowCount = 0;
    let downCount = 0;
    for (const s of targetStatuses) {
      const cls = s.healthStatus;
      if (cls === 'healthy') healthyCount++;
      else if (cls === 'slow') slowCount++;
      else if (cls === 'very_slow') verySlowCount++;
      else downCount++;
    }
    return { totalModels, providerCount, healthyCount, slowCount, verySlowCount, downCount };
  }, [targets, statuses]);

  // Build draft target key set for quick lookup
  const draftTargetKeys = new Set(draftTargets.map(t => `${t.providerId}::${t.modelName}`));

  const toggleDraftTarget = (providerId: string, modelName: string, providerName: string) => {
    const key = `${providerId}::${modelName}`;
    let next: MonitorTarget[];
    if (draftTargetKeys.has(key)) {
      next = draftTargets.filter(t => `${t.providerId}::${t.modelName}` !== key);
    } else {
      next = [...draftTargets, { providerId, modelName, providerName }];
    }
    setDraftTargets(next);
  };

  const updateDraftTargetInterval = (providerId: string, modelName: string, intervalMinutes: number) => {
    setDraftTargets(draftTargets.map(t =>
      t.providerId === providerId && t.modelName === modelName
        ? { ...t, intervalMinutes }
        : t
    ));
  };

  const selectAllForProvider = (provider: any) => {
    const activeModels = provider.models.filter((m: any) => m.isActive !== false);
    let next = [...draftTargets];
    for (const m of activeModels) {
      const key = `${provider.id}::${m.name}`;
      if (!draftTargetKeys.has(key)) {
        next.push({ providerId: provider.id, modelName: m.name, providerName: provider.name });
      }
    }
    setDraftTargets(next);
  };

  const removeAllForProvider = (provider: any) => {
    setDraftTargets(draftTargets.filter(t => t.providerId !== provider.id));
  };

  // Group targets by provider
  const grouped = new Map<string, MonitorTarget[]>();
  for (const t of targets) {
    if (!grouped.has(t.providerId)) grouped.set(t.providerId, []);
    grouped.get(t.providerId)!.push(t);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-card p-4 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">API Monitor</h2>
          {lastChecked && (
            <div className="flex items-center gap-1.5 mt-1">
              <ClockCircleOutlined className="text-[11px] text-text-tertiary" />
              <span className="text-[11px] text-text-tertiary">Last checked: {formatTime(lastChecked)}</span>
              <span className="text-[10px] text-text-tertiary ml-2">Auto-refresh 60s · Check every {globalConfig.defaultIntervalMinutes} min</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip title="Settings">
            <Button
              icon={<SettingOutlined />}
              onClick={() => setShowConfig(!showConfig)}
              size="small"
              type={showConfig ? 'primary' : 'default'}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<ReloadOutlined spin={running} />}
            onClick={triggerRun}
            loading={running}
            size="small"
          >
            Run Check
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      {targets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <div className="glass-card px-3 py-2 flex items-center gap-2 col-span-2">
            <div className="w-2 h-2 rounded-full bg-accent-blue" />
            <div>
              <div className="text-[10px] text-text-tertiary">Monitoring</div>
              <div className="text-[13px] font-semibold text-text-primary font-mono">{summary.totalModels} models · {summary.providerCount} providers</div>
            </div>
          </div>
          <div className="glass-card px-3 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div>
              <div className="text-[10px] text-text-tertiary">Healthy</div>
              <div className="text-[13px] font-semibold text-emerald-400 font-mono">{summary.healthyCount}</div>
            </div>
          </div>
          <div className="glass-card px-3 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <div>
              <div className="text-[10px] text-text-tertiary">Slow</div>
              <div className="text-[13px] font-semibold text-amber-400 font-mono">{summary.slowCount}</div>
            </div>
          </div>
          <div className="glass-card px-3 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <div>
              <div className="text-[10px] text-text-tertiary">Very Slow</div>
              <div className="text-[13px] font-semibold text-orange-400 font-mono">{summary.verySlowCount}</div>
            </div>
          </div>
          <div className="glass-card px-3 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <div>
              <div className="text-[10px] text-text-tertiary">Down</div>
              <div className="text-[13px] font-semibold text-red-400 font-mono">{summary.downCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showConfig && (
        <div className="glass-card p-4 space-y-4">
          {/* Header row with Save button */}
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-text-primary">Settings</div>
            <div className="flex items-center gap-2">
              {configDirty && <span className="text-[10px] text-amber-400">Unsaved changes</span>}
              <Button type="primary" size="small" onClick={handleSaveAll} disabled={!configDirty}>
                Save
              </Button>
            </div>
          </div>
          {/* Global Config */}
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-text-primary">Global Settings</div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary">Default interval</span>
                <Select
                  size="small"
                  value={draftInterval}
                  onChange={(v) => { setDraftInterval(v); setConfigDirty(true); }}
                  options={DEFAULT_INTERVAL_OPTIONS}
                  style={{ width: 100 }}
                />
              </div>
            </div>
          </div>

          {/* Health Thresholds */}
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-text-primary">Health Thresholds</div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary">Slow latency</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono">≥</span>
                <input
                  type="text"
                  className="w-14 px-2 py-1 text-[11px] rounded border border-border bg-[#0a0a0a] text-text-primary font-mono text-center"
                  value={thresholdTexts.latencySlowMs}
                  onChange={(e) => {
                    setThresholdTexts({ ...thresholdTexts, latencySlowMs: e.target.value });
                    setConfigDirty(true);
                  }}
                />
                <span className="text-[10px] text-text-tertiary">ms</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary">Very slow</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-mono">≥</span>
                <input
                  type="text"
                  className="w-14 px-2 py-1 text-[11px] rounded border border-border bg-[#0a0a0a] text-text-primary font-mono text-center"
                  value={thresholdTexts.latencyVerySlowMs}
                  onChange={(e) => {
                    setThresholdTexts({ ...thresholdTexts, latencyVerySlowMs: e.target.value });
                    setConfigDirty(true);
                  }}
                />
                <span className="text-[10px] text-text-tertiary">ms</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary">Slow TTFT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono">≥</span>
                <input
                  type="text"
                  className="w-14 px-2 py-1 text-[11px] rounded border border-border bg-[#0a0a0a] text-text-primary font-mono text-center"
                  value={thresholdTexts.ttftSlowMs}
                  onChange={(e) => {
                    setThresholdTexts({ ...thresholdTexts, ttftSlowMs: e.target.value });
                    setConfigDirty(true);
                  }}
                />
                <span className="text-[10px] text-text-tertiary">ms</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary">Min tokens</span>
                <input
                  type="text"
                  className="w-12 px-2 py-1 text-[11px] rounded border border-border bg-[#0a0a0a] text-text-primary font-mono text-center"
                  value={thresholdTexts.minOutputTokens}
                  onChange={(e) => {
                    setThresholdTexts({ ...thresholdTexts, minOutputTokens: e.target.value });
                    setConfigDirty(true);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Provider/Model Selection */}
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-text-primary">Targets</div>
            {providers.map(provider => {
              const activeModels = provider.models.filter((m: any) => m.isActive !== false);
              const providerDraftTargets = draftTargets.filter(t => t.providerId === provider.id);
              const allSelected = activeModels.length > 0 && providerDraftTargets.length === activeModels.length;

              return (
                <div key={provider.id} className="border border-border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={providerDraftTargets.length > 0 && !allSelected}
                        onChange={() => allSelected ? removeAllForProvider(provider) : selectAllForProvider(provider)}
                      />
                      <span className="text-[12px] font-medium text-text-primary">{provider.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono">{provider.format}</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-6">
                    {activeModels.map((m: any) => {
                      const key = `${provider.id}::${m.name}`;
                      const checked = draftTargetKeys.has(key);
                      const targetData = draftTargets.find(t => t.providerId === provider.id && t.modelName === m.name);
                      return (
                        <div key={m.name} className="flex items-center gap-1.5">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onChange={() => toggleDraftTarget(provider.id, m.name, provider.name)}
                              size="small"
                            />
                            <span className="text-[11px] text-text-secondary font-mono">{m.displayName || m.name}</span>
                            {m.supportsVision && <span className="text-[8px] px-1 rounded bg-accent-teal/15 text-accent-teal">V</span>}
                          </label>
                          {checked && (
                            <Select
                              size="small"
                              value={targetData?.intervalMinutes || 0}
                              onChange={(v) => updateDraftTargetInterval(provider.id, m.name, v)}
                              options={INTERVAL_OPTIONS}
                              style={{ width: 95 }}
                              popupMatchSelectWidth={false}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Cards Grid */}
      {targets.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-text-tertiary text-[13px]">
            {providers.length === 0
              ? 'No providers configured. Add providers in Settings to enable monitoring.'
              : 'No targets selected. Click the gear icon above to select providers and models to monitor.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {Array.from(grouped.entries()).map(([providerId, providerTargets]) => {
            const provider = providers.find(p => p.id === providerId);
            if (!provider) return null;

            const pings = statuses.filter(s => s.providerId === providerId);

            return (
              <div key={providerId} className="glass-card p-4 space-y-3">
                {/* Provider Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-medium text-text-primary">{provider.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono">{provider.format}</span>
                      <span className="text-[10px] text-text-tertiary">{providerTargets.length} models</span>
                    </div>
                  </div>
                </div>

                {/* Model Cards */}
                <div className="space-y-2">
                  {providerTargets.map(target => {
                    const ping = pings.find(p => p.modelName === target.modelName);
                    const cls = ping ? ping.healthStatus : null;
                    const modelInfo = provider.models.find((m: any) => m.name === target.modelName);
                    const modelLabel = modelInfo?.displayName || target.modelName;
                    return (
                      <div key={target.modelName} className="rounded border border-border bg-[#0a0a0a] p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {cls && <div className={`w-2 h-2 rounded-full ${getStatusDotColor(cls)}`} />}
                            <span className="font-mono text-[12px] text-text-primary">{modelLabel}</span>
                            {cls && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                cls === 'healthy' ? 'bg-emerald-500/10 text-emerald-400' :
                                cls === 'slow' ? 'bg-amber-500/10 text-amber-400' :
                                cls === 'very_slow' ? 'bg-orange-500/10 text-orange-400' :
                                'bg-red-500/10 text-red-400'
                              }`}>{getStatusLabel(cls)}</span>
                            )}
                            {ping && ping.outputTokens > 0 && (
                              <span className="text-[9px] text-text-tertiary font-mono">{ping.outputTokens}tok</span>
                            )}
                          </div>
                          {ping ? (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-tertiary">
                              <Tooltip title="TTFT (first token)">
                                <span className={cls !== 'healthy' ? getStatusTextColor(cls!) : ''}>{formatLatency(ping.ttftMs)}</span>
                              </Tooltip>
                              <span>→</span>
                              <Tooltip title="Total latency">
                                <span className={`font-medium ${getStatusTextColor(cls!)}`}>
                                  {ping.status === 'error' ? 'FAIL' : formatLatency(ping.latencyMs)}
                                </span>
                              </Tooltip>
                            </div>
                          ) : (
                            <span className="text-[10px] text-text-tertiary">Pending</span>
                          )}
                        </div>
                        {ping?.outputTokens === 0 && ping.status === 'ok' && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-400">
                            <WarningOutlined className="text-[10px]" />
                            <span>Empty response (0 tokens)</span>
                          </div>
                        )}
                        {ping?.errorMessage && (
                          <div className="text-[10px] text-red-400/80 truncate">{ping.errorMessage}</div>
                        )}
                        <HistoryBar history={history} providerId={providerId} modelName={target.modelName} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

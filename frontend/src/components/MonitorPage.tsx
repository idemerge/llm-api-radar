import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Button, Tooltip, Checkbox, Select } from '../antdImports';
import {
  ReloadOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  WarningOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useMonitor, PingResult, MonitorTarget, HealthThresholds } from '../hooks/useMonitor';
import { useProviders } from '../hooks/useProviders';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';

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

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
] as const;

const CHART_COLORS = { ttft: '#f59e0b', tps: '#10b981', latency: '#3b82f6' };

const CHART_TOOLTIP_STYLE = {
  background: '#1f1f1f',
  border: '1px solid #303030',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '11px',
};

function formatChartTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface TrendChartsProps {
  history: PingResult[];
  providerId: string;
  modelName: string;
  thresholds: HealthThresholds;
}

function TrendCharts({ history, providerId, modelName, thresholds }: TrendChartsProps) {
  const [range, setRange] = useState<number>(24);

  const data = useMemo(() => {
    const cutoff = Date.now() - range * 60 * 60 * 1000;
    return history
      .filter(
        (p) => p.providerId === providerId && p.modelName === modelName && new Date(p.checkedAt).getTime() >= cutoff,
      )
      .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
      .map((p) => ({
        time: formatChartTime(p.checkedAt),
        ttft: p.status === 'ok' ? +(p.ttftMs / 1000).toFixed(2) : undefined,
        tps: p.status === 'ok' && p.latencyMs > 0 ? Math.round((p.outputTokens / p.latencyMs) * 1000) : undefined,
        latency: p.status === 'ok' ? +(p.latencyMs / 1000).toFixed(2) : undefined,
        isError: p.status === 'error',
      }));
  }, [history, providerId, modelName, range]);

  if (data.length === 0) {
    return <div className="text-[11px] text-text-tertiary py-2">No data for selected time range.</div>;
  }

  const charts: { key: string; label: string; dataKey: string; color: string; unit: string; refLine?: number }[] = [
    {
      key: 'ttft',
      label: 'TTFT',
      dataKey: 'ttft',
      color: CHART_COLORS.ttft,
      unit: 's',
      refLine: +(thresholds.ttftSlowMs / 1000).toFixed(2),
    },
    {
      key: 'tps',
      label: 'TPS',
      dataKey: 'tps',
      color: CHART_COLORS.tps,
      unit: 'tok/s',
      refLine: thresholds.tpsSlowThreshold,
    },
    { key: 'latency', label: 'Latency', dataKey: 'latency', color: CHART_COLORS.latency, unit: 's' },
  ];

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center gap-1">
        {TIME_RANGES.map((r) => (
          <button
            key={r.hours}
            onClick={() => setRange(r.hours)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              range === r.hours ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {charts.map((c) => (
          <div key={c.key} className="rounded border border-border bg-[#060606] p-2">
            <div className="text-[10px] text-text-tertiary mb-1">
              {c.label} <span className="text-text-tertiary/50">({c.unit})</span>
            </div>
            <div className="h-[100px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={c.color} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={c.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="time"
                    stroke="#585a6e"
                    tick={{ fontSize: 9, fill: '#8e8fa2' }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#585a6e"
                    tick={{ fontSize: 9, fill: '#8e8fa2' }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    width={40}
                  />
                  <RTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: '#d8d9da' }}
                    formatter={(value) => [`${value ?? ''} ${c.unit}`, c.label]}
                  />
                  {c.refLine != null && (
                    <ReferenceLine
                      y={c.refLine}
                      stroke="#f59e0b"
                      strokeDasharray="4 3"
                      strokeOpacity={0.5}
                      label={{ value: `${c.refLine}`, position: 'right', fontSize: 9, fill: '#f59e0b80' }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey={c.dataKey}
                    stroke={c.color}
                    strokeWidth={1.5}
                    fill={`url(#grad-${c.key})`}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 1, stroke: '#000' }}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryBar({
  history,
  providerId,
  modelName,
}: {
  history: PingResult[];
  providerId: string;
  modelName: string;
}) {
  const pings = history.filter((p) => p.providerId === providerId && p.modelName === modelName).slice(-144);

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
                  <span>
                    TPS{' '}
                    <span className="text-white font-mono">
                      {p.latencyMs > 0 ? Math.round((p.outputTokens / p.latencyMs) * 1000) : 0}
                    </span>
                  </span>
                  <span>
                    TTFT <span className="text-white font-mono">{formatLatency(p.ttftMs)}</span>
                  </span>
                  <span>
                    Latency <span className="text-white font-mono">{formatLatency(p.latencyMs)}</span>
                  </span>
                </div>
                {p.errorMessage && <div className="text-red-300 pl-3 truncate max-w-[240px]">{p.errorMessage}</div>}
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
  const {
    statuses,
    history,
    targets,
    globalConfig,
    loading: monitorLoading,
    running,
    fetchAll,
    saveTargets,
    saveConfig,
    triggerRun,
  } = useMonitor();
  const { providers, loading: providersLoading, fetchProviders } = useProviders();
  const [lastChecked, setLastChecked] = useState<string>('');
  const [showConfig, setShowConfig] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [draftInterval, setDraftInterval] = useState(globalConfig.defaultIntervalMinutes);
  const [thresholdTexts, setThresholdTexts] = useState<Record<keyof HealthThresholds, string>>({
    tpsSlowThreshold: String(globalConfig.healthThresholds.tpsSlowThreshold),
    tpsVerySlowThreshold: String(globalConfig.healthThresholds.tpsVerySlowThreshold),
    ttftSlowMs: String(globalConfig.healthThresholds.ttftSlowMs),
    minOutputTokens: String(globalConfig.healthThresholds.minOutputTokens),
  });
  const [draftTargets, setDraftTargets] = useState<MonitorTarget[]>(targets);
  const [configDirty, setConfigDirty] = useState(false);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((key: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Sync draft when backend data changes
  useEffect(() => {
    setDraftInterval(globalConfig.defaultIntervalMinutes);
    setThresholdTexts({
      tpsSlowThreshold: String(globalConfig.healthThresholds.tpsSlowThreshold),
      tpsVerySlowThreshold: String(globalConfig.healthThresholds.tpsVerySlowThreshold),
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
      (k) =>
        thresholdTexts[k as keyof HealthThresholds] !==
        String(globalConfig.healthThresholds[k as keyof HealthThresholds]),
    );
    const targetsChanged = JSON.stringify(draftTargets) !== JSON.stringify(targets);
    setConfigDirty(intervalChanged || thresholdsChanged || targetsChanged);
  }, [draftInterval, thresholdTexts, draftTargets, globalConfig, targets]);

  const handleSaveAll = () => {
    const parsedThresholds: HealthThresholds = {
      tpsSlowThreshold: parseInt(thresholdTexts.tpsSlowThreshold) || 20,
      tpsVerySlowThreshold: parseInt(thresholdTexts.tpsVerySlowThreshold) || 5,
      ttftSlowMs: parseInt(thresholdTexts.ttftSlowMs) || 1000,
      minOutputTokens: parseInt(thresholdTexts.minOutputTokens) || 1,
    };
    saveConfig({
      defaultIntervalMinutes: draftInterval,
      healthThresholds: parsedThresholds,
    });
    saveTargets(draftTargets);
  };
  const refreshRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    Promise.all([fetchProviders(), fetchAll()]).then(() => setInitialLoaded(true));
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
      const latestTime = statuses.reduce(
        (latest, s) => (s.checkedAt > latest ? s.checkedAt : latest),
        statuses[0].checkedAt,
      );
      setLastChecked(latestTime);
    }
  }, [statuses]);

  const thresholds = globalConfig.healthThresholds;

  // Summary stats — only count statuses that match current targets
  const summary = useMemo(() => {
    const totalModels = targets.length;
    const providerCount = new Set(targets.map((t) => t.providerId)).size;
    const targetKeys = new Set(targets.map((t) => `${t.providerId}::${t.modelName}`));
    const targetStatuses = statuses.filter((s) => targetKeys.has(`${s.providerId}::${s.modelName}`));
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
  const draftTargetKeys = new Set(draftTargets.map((t) => `${t.providerId}::${t.modelName}`));

  const toggleDraftTarget = (providerId: string, modelName: string, providerName: string) => {
    const key = `${providerId}::${modelName}`;
    let next: MonitorTarget[];
    if (draftTargetKeys.has(key)) {
      next = draftTargets.filter((t) => `${t.providerId}::${t.modelName}` !== key);
    } else {
      next = [...draftTargets, { providerId, modelName, providerName }];
    }
    setDraftTargets(next);
  };

  const updateDraftTargetInterval = (providerId: string, modelName: string, intervalMinutes: number) => {
    setDraftTargets(
      draftTargets.map((t) =>
        t.providerId === providerId && t.modelName === modelName ? { ...t, intervalMinutes } : t,
      ),
    );
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
    setDraftTargets(draftTargets.filter((t) => t.providerId !== provider.id));
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
              <span className="text-[10px] text-text-tertiary ml-2">
                Auto-refresh 60s · Check every {globalConfig.defaultIntervalMinutes} min
              </span>
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
              <div className="text-[13px] font-semibold text-text-primary font-mono">
                {summary.totalModels} models · {summary.providerCount} providers
              </div>
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
                  onChange={(v) => {
                    setDraftInterval(v);
                    setConfigDirty(true);
                  }}
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
                <span className="text-[11px] text-text-secondary">Slow TPS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono">&lt;</span>
                <input
                  type="text"
                  className="w-14 px-2 py-1 text-[11px] rounded border border-border bg-[#0a0a0a] text-text-primary font-mono text-center"
                  value={thresholdTexts.tpsSlowThreshold}
                  onChange={(e) => {
                    setThresholdTexts({ ...thresholdTexts, tpsSlowThreshold: e.target.value });
                    setConfigDirty(true);
                  }}
                />
                <span className="text-[10px] text-text-tertiary">tok/s</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary">Very slow TPS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-mono">&lt;</span>
                <input
                  type="text"
                  className="w-14 px-2 py-1 text-[11px] rounded border border-border bg-[#0a0a0a] text-text-primary font-mono text-center"
                  value={thresholdTexts.tpsVerySlowThreshold}
                  onChange={(e) => {
                    setThresholdTexts({ ...thresholdTexts, tpsVerySlowThreshold: e.target.value });
                    setConfigDirty(true);
                  }}
                />
                <span className="text-[10px] text-text-tertiary">tok/s</span>
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
            {providers.map((provider) => {
              const activeModels = provider.models.filter((m: any) => m.isActive !== false);
              const providerDraftTargets = draftTargets.filter((t) => t.providerId === provider.id);
              const allSelected = activeModels.length > 0 && providerDraftTargets.length === activeModels.length;

              return (
                <div key={provider.id} className="border border-border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={providerDraftTargets.length > 0 && !allSelected}
                        onChange={() => (allSelected ? removeAllForProvider(provider) : selectAllForProvider(provider))}
                      />
                      <span className="text-[12px] font-medium text-text-primary">{provider.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono">
                        {provider.format}
                      </span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-6">
                    {activeModels.map((m: any) => {
                      const key = `${provider.id}::${m.name}`;
                      const checked = draftTargetKeys.has(key);
                      const targetData = draftTargets.find(
                        (t) => t.providerId === provider.id && t.modelName === m.name,
                      );
                      return (
                        <div key={m.name} className="flex items-center gap-1.5">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onChange={() => toggleDraftTarget(provider.id, m.name, provider.name)}
                            />
                            <span className="text-[11px] text-text-secondary font-mono">{m.displayName || m.name}</span>
                            {m.supportsVision && (
                              <span className="text-[8px] px-1 rounded bg-accent-teal/15 text-accent-teal">V</span>
                            )}
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
      {!initialLoaded ? (
        <div className="glass-card p-8 text-center">
          <span className="text-text-tertiary text-[13px] animate-pulse">Loading...</span>
        </div>
      ) : targets.length === 0 ? (
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
            const provider = providers.find((p) => p.id === providerId);
            if (!provider) return null;

            const pings = statuses.filter((s) => s.providerId === providerId);

            return (
              <div key={providerId} className="glass-card p-4 space-y-3">
                {/* Provider Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-medium text-text-primary">{provider.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono">
                        {provider.format}
                      </span>
                      <span className="text-[10px] text-text-tertiary">{providerTargets.length} models</span>
                    </div>
                  </div>
                </div>

                {/* Model Cards */}
                <div className="space-y-2">
                  {providerTargets.map((target) => {
                    const ping = pings.find((p) => p.modelName === target.modelName);
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
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                  cls === 'healthy'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : cls === 'slow'
                                      ? 'bg-amber-500/10 text-amber-400'
                                      : cls === 'very_slow'
                                        ? 'bg-orange-500/10 text-orange-400'
                                        : 'bg-red-500/10 text-red-400'
                                }`}
                              >
                                {getStatusLabel(cls)}
                              </span>
                            )}
                            {ping && ping.outputTokens > 0 && ping.latencyMs > 0 && (
                              <span className="text-[9px] text-text-tertiary font-mono">
                                {Math.round((ping.outputTokens / ping.latencyMs) * 1000)} tok/s
                              </span>
                            )}
                          </div>
                          {ping ? (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-tertiary">
                              <Tooltip title="TTFT (first token)">
                                <span className={cls !== 'healthy' ? getStatusTextColor(cls!) : ''}>
                                  {formatLatency(ping.ttftMs)}
                                </span>
                              </Tooltip>
                              <span>·</span>
                              <Tooltip title="Tokens per second">
                                <span className={`font-medium ${getStatusTextColor(cls!)}`}>
                                  {ping.status === 'error'
                                    ? 'FAIL'
                                    : `${ping.latencyMs > 0 ? Math.round((ping.outputTokens / ping.latencyMs) * 1000) : 0} tok/s`}
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
                        <div className="flex items-center justify-between">
                          <HistoryBar history={history} providerId={providerId} modelName={target.modelName} />
                          <Tooltip
                            title={
                              expandedModels.has(`${providerId}::${target.modelName}`) ? 'Hide trends' : 'Show trends'
                            }
                          >
                            <button
                              onClick={() => toggleExpanded(`${providerId}::${target.modelName}`)}
                              className={`ml-2 shrink-0 text-[11px] p-1 rounded transition-colors ${
                                expandedModels.has(`${providerId}::${target.modelName}`)
                                  ? 'text-accent-blue bg-accent-blue/10'
                                  : 'text-text-tertiary hover:text-text-secondary'
                              }`}
                            >
                              <LineChartOutlined />
                            </button>
                          </Tooltip>
                        </div>
                        {expandedModels.has(`${providerId}::${target.modelName}`) && (
                          <TrendCharts
                            history={history}
                            providerId={providerId}
                            modelName={target.modelName}
                            thresholds={thresholds}
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
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BenchmarkRun, getProviderColor, getProviderDisplayName, ErrorCategory } from '../types';
import { Button, Table, Tag, Segmented, Card, Space } from '../antdImports';
import { AppstoreOutlined, TableOutlined, DownloadOutlined, BarChartOutlined } from '@ant-design/icons';

interface ResultsPanelProps {
  run: BenchmarkRun | null;
  onExport: (id: string, format: 'json' | 'csv') => void;
}

type ViewMode = 'cards' | 'table';

export function ResultsPanel({ run, onExport }: ResultsPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showCharts, setShowCharts] = useState(false);

  const providers = useMemo(() => (run ? Object.keys(run.results) : []), [run]);

  const tableDataSource = useMemo(
    () =>
      run
        ? providers.map((p) => {
            const s = run.results[p].summary;
            const totalReasoning = run.results[p].iterations.reduce((a, b) => a + (b.reasoningTokens || 0), 0);
            return { key: p, provider: p, summary: s, totalReasoning };
          })
        : [],
    [providers, run],
  );

  if (!run || providers.length === 0) {
    return null;
  }

  const responseTimeData = providers.map((p) => ({
    name: p.charAt(0).toUpperCase() + p.slice(1),
    avg: run.results[p].summary.avgResponseTime,
    p95: run.results[p].summary.p95ResponseTime,
    provider: p,
  }));

  const throughputData = providers.map((p) => ({
    name: p.charAt(0).toUpperCase() + p.slice(1),
    value: run.results[p].summary.avgTokensPerSecond,
    systemValue: run.results[p].summary.systemThroughput || 0,
    provider: p,
  }));

  const tooltipStyle = {
    background: '#1f1f1f',
    border: '1px solid #303030',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11px',
  };

  const tableColumns = [
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      render: (p: string) => (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: getProviderColor(p) }} />
          <span className="text-text-primary font-medium">{getProviderDisplayName(p)}</span>
        </div>
      ),
    },
    {
      title: 'Avg Response',
      dataIndex: 'summary',
      key: 'avgResponse',
      align: 'right' as const,
      render: (s: BenchmarkRun['results'][string]['summary']) => (
        <span className="data-value text-xs text-text-primary">{s.avgResponseTime}ms</span>
      ),
    },
    {
      title: 'P95',
      dataIndex: 'summary',
      key: 'p95',
      align: 'right' as const,
      render: (s: BenchmarkRun['results'][string]['summary']) => (
        <span className="data-value text-xs text-text-primary">{s.p95ResponseTime}ms</span>
      ),
    },
    {
      title: 'Tokens/s',
      dataIndex: 'provider',
      key: 'tokensPerSec',
      align: 'right' as const,
      render: (p: string) => (
        <span className="data-value text-xs font-medium" style={{ color: getProviderColor(p) }}>
          {run.results[p].summary.avgTokensPerSecond}
        </span>
      ),
    },
    {
      title: 'Sys TP',
      dataIndex: 'provider',
      key: 'sysTp',
      align: 'right' as const,
      render: (p: string) => (
        <span className="data-value text-xs" style={{ color: getProviderColor(p), opacity: 0.7 }}>
          {run.results[p].summary.systemThroughput || '-'}
        </span>
      ),
    },
    {
      title: 'TTFT P50',
      dataIndex: 'summary',
      key: 'ttftP50',
      align: 'right' as const,
      render: (s: BenchmarkRun['results'][string]['summary']) => (
        <span className="data-value text-xs text-text-primary">
          {s.p50FirstTokenLatency || s.avgFirstTokenLatency
            ? `${s.p50FirstTokenLatency || s.avgFirstTokenLatency}ms`
            : 'N/A'}
        </span>
      ),
    },
    {
      title: 'TTFT P95',
      dataIndex: 'summary',
      key: 'ttftP95',
      align: 'right' as const,
      render: (s: BenchmarkRun['results'][string]['summary']) => (
        <span className="data-value text-xs text-text-primary">
          {s.p95FirstTokenLatency ? `${s.p95FirstTokenLatency}ms` : 'N/A'}
        </span>
      ),
    },
    {
      title: 'TTFT P99',
      dataIndex: 'summary',
      key: 'ttftP99',
      align: 'right' as const,
      render: (s: BenchmarkRun['results'][string]['summary']) => (
        <span className="data-value text-xs text-text-primary">
          {s.p99FirstTokenLatency ? `${s.p99FirstTokenLatency}ms` : 'N/A'}
        </span>
      ),
    },
    {
      title: 'Reasoning',
      dataIndex: 'totalReasoning',
      key: 'reasoning',
      align: 'right' as const,
      render: (v: number) => (
        <span className="data-value text-xs text-accent-violet">{v > 0 ? v.toLocaleString() : '-'}</span>
      ),
    },
    {
      title: 'Cost',
      dataIndex: 'summary',
      key: 'cost',
      align: 'right' as const,
      render: (s: BenchmarkRun['results'][string]['summary']) => (
        <span className="data-value text-xs text-accent-amber">${s.estimatedCost.toFixed(4)}</span>
      ),
    },
    {
      title: 'Success',
      dataIndex: 'summary',
      key: 'success',
      align: 'right' as const,
      render: (s: BenchmarkRun['results'][string]['summary']) => {
        const rate = (s.successRate * 100).toFixed(0);
        const color = s.successRate === 1 ? 'success' : 'warning';
        return <Tag color={color}>{rate}%</Tag>;
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Results Summary</h3>
          <div className="flex items-center gap-2">
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as ViewMode)}
              options={[
                {
                  label: (
                    <span className="flex items-center gap-1 font-mono" style={{ fontSize: '11px' }}>
                      <AppstoreOutlined style={{ fontSize: 12 }} />
                      Cards
                    </span>
                  ),
                  value: 'cards',
                },
                {
                  label: (
                    <span className="flex items-center gap-1 font-mono" style={{ fontSize: '11px' }}>
                      <TableOutlined style={{ fontSize: 12 }} />
                      Table
                    </span>
                  ),
                  value: 'table',
                },
              ]}
            />
            <Button
              size="small"
              onClick={() => onExport(run.id, 'json')}
              icon={<DownloadOutlined />}
              className="font-mono"
              style={{ fontSize: '11px' }}
            >
              JSON
            </Button>
            <Button
              size="small"
              onClick={() => onExport(run.id, 'csv')}
              icon={<DownloadOutlined />}
              className="font-mono"
              style={{ fontSize: '11px' }}
            >
              CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Card View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {providers.map((p, i) => {
            const s = run.results[p].summary;
            const totalReasoning = run.results[p].iterations.reduce((a, b) => a + (b.reasoningTokens || 0), 0);

            return (
              <motion.div
                key={p}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card variant="borderless" className="glass-card overflow-hidden" styles={{ body: { padding: 0 } }}>
                  {/* Provider header -- left accent bar style */}
                  <div
                    className="px-5 py-3.5 flex items-center gap-3 relative"
                    style={{ borderBottom: `1px solid ${getProviderColor(p)}15` }}
                  >
                    <div
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                      style={{ backgroundColor: getProviderColor(p), opacity: 0.6 }}
                    />
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wider font-mono"
                      style={{
                        color: getProviderColor(p),
                      }}
                    >
                      {getProviderDisplayName(p)}
                    </span>
                    <Tag
                      color={s.successRate === 1 ? 'success' : 'warning'}
                      className="font-mono"
                      style={{
                        marginLeft: 'auto',
                        fontSize: '11px',
                      }}
                    >
                      {(s.successRate * 100).toFixed(0)}% success
                    </Tag>
                  </div>

                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      <div>
                        <div className="data-label mb-1.5">Throughput</div>
                        <div className="data-value text-2xl" style={{ color: getProviderColor(p) }}>
                          {s.avgTokensPerSecond}
                          <span className="text-xs font-normal text-text-secondary ml-1">tok/s</span>
                        </div>
                      </div>
                      <div>
                        <div className="data-label mb-1.5">Avg Response</div>
                        <div className="data-value text-2xl text-text-primary">
                          {s.avgResponseTime}
                          <span className="text-xs font-normal text-text-secondary ml-1">ms</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded-md bg-bg-surface border border-border text-center">
                        <div className="text-text-secondary mb-1 text-[10px]">P95</div>
                        <div className="data-value text-text-primary text-xs">{s.p95ResponseTime}ms</div>
                      </div>
                      <div className="p-2.5 rounded-md bg-bg-surface border border-border text-center">
                        <div className="text-text-secondary mb-1 text-[10px]">TTFT P50</div>
                        <div className="data-value text-text-primary text-xs">
                          {s.p50FirstTokenLatency || s.avgFirstTokenLatency
                            ? `${s.p50FirstTokenLatency || s.avgFirstTokenLatency}ms`
                            : 'N/A'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-md bg-bg-surface border border-border text-center">
                        <div className="text-text-secondary mb-1 text-[10px]">Sys TP</div>
                        <div className="data-value text-xs" style={{ color: getProviderColor(p) }}>
                          {s.systemThroughput || '-'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-md bg-bg-surface border border-border text-center">
                        <div className="text-text-secondary mb-1 text-[10px]">TTFT P95</div>
                        <div className="data-value text-text-primary text-xs">
                          {s.p95FirstTokenLatency ? `${s.p95FirstTokenLatency}ms` : 'N/A'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-md bg-bg-surface border border-border text-center">
                        <div className="text-text-secondary mb-1 text-[10px]">Cost</div>
                        <div className="data-value text-accent-amber text-xs">${s.estimatedCost.toFixed(4)}</div>
                      </div>
                      <div className="p-2.5 rounded-md bg-bg-surface border border-border text-center">
                        <div className="text-text-secondary mb-1 text-[10px]">Reasoning</div>
                        <div className="data-value text-accent-violet text-xs">
                          {totalReasoning > 0 ? totalReasoning.toLocaleString() : '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="glass-card p-7">
          <Table dataSource={tableDataSource} columns={tableColumns} pagination={false} size="small" />
        </div>
      )}

      {/* Charts toggle */}
      <Button
        block
        onClick={() => setShowCharts(!showCharts)}
        icon={<BarChartOutlined />}
        className="font-mono"
        style={{ fontSize: '11px' }}
      >
        {showCharts ? 'Hide Charts' : 'Show Comparison Charts'}
      </Button>

      <AnimatePresence>
        {showCharts && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-5 overflow-hidden"
          >
            <div className="glass-card p-7">
              <h3 className="data-label mb-4">Response Time Comparison</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={responseTimeData} barGap={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" stroke="#585a6e" tick={{ fontSize: 10 }} className="font-mono" />
                    <YAxis stroke="#585a6e" tick={{ fontSize: 10 }} className="font-mono" />
                    <RechartsTooltip
                      contentStyle={tooltipStyle}
                      wrapperClassName="font-mono"
                      formatter={(value) => [`${value}ms`, '']}
                    />
                    <Bar dataKey="avg" name="Average" radius={[4, 4, 0, 0]}>
                      {responseTimeData.map((entry) => (
                        <Cell key={entry.provider} fill={getProviderColor(entry.provider)} fillOpacity={0.7} />
                      ))}
                    </Bar>
                    <Bar dataKey="p95" name="P95" radius={[4, 4, 0, 0]}>
                      {responseTimeData.map((entry) => (
                        <Cell key={entry.provider} fill={getProviderColor(entry.provider)} fillOpacity={0.25} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-7">
              <h3 className="data-label mb-4">Throughput Comparison (Tokens/Second)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={throughputData} barGap={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" stroke="#585a6e" tick={{ fontSize: 10 }} className="font-mono" />
                    <YAxis stroke="#585a6e" tick={{ fontSize: 10 }} className="font-mono" />
                    <RechartsTooltip
                      contentStyle={tooltipStyle}
                      wrapperClassName="font-mono"
                      formatter={(value, name) => [`${value} tok/s`, name === 'value' ? 'Per Request' : 'System']}
                    />
                    <Bar dataKey="value" name="value" radius={[4, 4, 0, 0]}>
                      {throughputData.map((entry) => (
                        <Cell key={entry.provider} fill={getProviderColor(entry.provider)} fillOpacity={0.7} />
                      ))}
                    </Bar>
                    <Bar dataKey="systemValue" name="systemValue" radius={[4, 4, 0, 0]}>
                      {throughputData.map((entry) => (
                        <Cell key={entry.provider} fill={getProviderColor(entry.provider)} fillOpacity={0.25} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-3 text-[11px] text-text-secondary font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-white/60" /> Per Request
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-white/25" /> System
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Breakdown */}
      {providers.some((p) => run.results[p].summary.errorCount > 0) && (
        <div className="glass-card p-7">
          <h3 className="data-label mb-4">Error Breakdown</h3>
          <div className="space-y-3">
            {providers
              .filter((p) => run.results[p].summary.errorCount > 0)
              .map((p) => {
                const breakdown = run.results[p].summary.errorBreakdown;
                if (!breakdown) return null;
                const categories: { key: ErrorCategory; label: string; color: string }[] = [
                  { key: 'timeout', label: 'Timeout', color: '#ef4444' },
                  { key: 'rate_limit', label: 'Rate Limit', color: '#ffb224' },
                  { key: 'api_error', label: 'API Error', color: '#ff6b35' },
                  { key: 'network', label: 'Network', color: '#a78bfa' },
                  { key: 'unknown', label: 'Unknown', color: '#6b7a8d' },
                ];
                return (
                  <div key={p} className="flex items-center gap-3">
                    <span className="text-text-primary text-sm w-24 font-medium truncate">
                      {getProviderDisplayName(p)}
                    </span>
                    <Space wrap size={4}>
                      {categories
                        .filter((c) => breakdown[c.key] > 0)
                        .map((c) => (
                          <Tag
                            key={c.key}
                            className="font-mono"
                            style={{
                              color: c.color,
                              backgroundColor: `${c.color}10`,
                              borderColor: `${c.color}20`,
                              fontSize: '11px',
                            }}
                          >
                            {c.label}: {breakdown[c.key]}
                          </Tag>
                        ))}
                    </Space>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

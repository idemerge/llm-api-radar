import { motion } from 'framer-motion';
import { CheckCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { BenchmarkRun, getProviderColor, getProviderDisplayName } from '../types';
import { MetricCard } from './MetricCard';
import { NeonGauge } from './NeonGauge';
import { LiveChart } from './LiveChart';
import { RadarComparison } from './RadarComparison';
import { Progress, Spin, Tag } from '../antdImports';

interface DashboardProps {
  run: BenchmarkRun | null;
  isRunning: boolean;
}

export function Dashboard({ run, isRunning }: DashboardProps) {
  const hasResults = run && Object.keys(run.results).length > 0;

  if (!hasResults) {
    return (
      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-10 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden"
        >
          <div className="flex flex-col items-center">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mb-4 opacity-20">
              <rect
                x="8"
                y="8"
                width="48"
                height="48"
                rx="8"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-secondary"
              />
              <path
                d="M24 32h16M32 24v16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="text-text-secondary"
              />
            </svg>
            <span className="text-base font-medium text-text-primary mb-1">
              {isRunning ? 'Running Benchmark...' : 'Ready to Benchmark'}
            </span>
            <span className="text-text-secondary text-sm text-center leading-relaxed">
              {isRunning
                ? 'Testing LLM providers. Results will appear in real-time.'
                : 'Configure test parameters and start a benchmark to compare LLM performance.'}
            </span>
          </div>

          {isRunning && run && (
            <div className="flex flex-col items-center gap-5 mt-6">
              <div className="flex gap-2">
                {run.providers.map((p) => (
                  <div key={p} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getProviderColor(p) }} />
                ))}
              </div>
              <p className="text-[11px] text-text-tertiary font-mono">Waiting for first results...</p>
            </div>
          )}
        </motion.div>

        {isRunning && run && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-7">
            <h3 className="section-title">Test Progress</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-md bg-bg-surface border border-border">
                <div className="data-label mb-1.5">Providers</div>
                <div className="data-value text-base text-accent-blue">
                  {run.providers.map((p) => getProviderDisplayName(p)).join(', ')}
                </div>
              </div>
              <div className="p-3 rounded-md bg-bg-surface border border-border">
                <div className="data-label mb-1.5">Concurrency</div>
                <div className="data-value text-base text-accent-violet">{run.config.concurrency}</div>
              </div>
              <div className="p-3 rounded-md bg-bg-surface border border-border">
                <div className="data-label mb-1.5">Iterations</div>
                <div className="data-value text-base text-accent-teal">{run.config.iterations}</div>
              </div>
              <div className="p-3 rounded-md bg-bg-surface border border-border">
                <div className="data-label mb-1.5">Streaming</div>
                <div className="data-value text-base text-accent-amber">{run.config.streaming ? 'ON' : 'OFF'}</div>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-md bg-accent-teal/6 border border-accent-teal/15">
              <div className="flex items-center gap-2">
                <Spin indicator={<LoadingOutlined style={{ fontSize: 14, color: '#00d4aa' }} spin />} />
                <span className="text-[12px] text-accent-teal font-mono">
                  Processing... Results will appear here when ready.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  const providers = Object.keys(run.results);

  const avgResponseTime = Math.round(
    providers.reduce((sum, p) => sum + (run.results[p]?.summary?.avgResponseTime || 0), 0) / providers.length,
  );
  const avgThroughput = Math.round(
    providers.reduce((sum, p) => sum + (run.results[p]?.summary?.avgTokensPerSecond || 0), 0) / providers.length,
  );
  const avgSystemThroughput = Math.round(
    providers.reduce((sum, p) => sum + (run.results[p]?.summary?.systemThroughput || 0), 0) / providers.length,
  );
  const _totalCost = Number(
    providers.reduce((sum, p) => sum + (run.results[p]?.summary?.estimatedCost || 0), 0).toFixed(4),
  );
  const totalIterations = providers.reduce((sum, p) => sum + (run.results[p]?.iterations?.length || 0), 0);

  const totalExpected = run.providers.length * (run.config?.iterations || 1);
  const totalCompleted = providers.reduce((sum, p) => sum + (run.results[p]?.iterations?.length || 0), 0);
  const progressPercent = Math.min(Math.round((totalCompleted / totalExpected) * 100), 100);
  const showProgress = isRunning || run.status === 'running';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Progress Bar */}
      {showProgress && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />
              <span className="text-sm font-semibold text-text-primary">Benchmark Running</span>
            </div>
            <span className="data-value text-sm text-accent-teal">{progressPercent}%</span>
          </div>

          <Progress
            percent={progressPercent}
            showInfo={false}
            strokeColor="#00d4aa"
            railColor="rgba(255,255,255,0.06)"
            size="small"
            style={{ marginBottom: 20 }}
          />

          <div className="space-y-2">
            {run.providers.map((p) => {
              const providerCompleted = run.results[p]?.iterations?.length || 0;
              const providerTotal = run.config?.iterations || 1;
              const providerPercent = Math.min(Math.round((providerCompleted / providerTotal) * 100), 100);
              const isProviderDone = providerPercent >= 100;

              return (
                <div key={p} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-20">
                    <div
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: getProviderColor(p) }}
                    />
                    <span className="text-[11px] text-text-secondary truncate font-mono">
                      {getProviderDisplayName(p)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <Progress
                      percent={providerPercent}
                      showInfo={false}
                      strokeColor={getProviderColor(p)}
                      railColor="rgba(255,255,255,0.06)"
                      size="small"
                    />
                  </div>
                  <span className="text-[11px] text-text-secondary w-16 text-right font-mono">
                    {isProviderDone ? (
                      <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        Done ✓
                      </Tag>
                    ) : (
                      `${providerCompleted}/${providerTotal}`
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Completion badge */}
      {run.status === 'completed' && !showProgress && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-5 flex items-center justify-between"
          style={{ borderColor: 'rgba(0,212,170,0.2)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircleFilled style={{ color: '#00d4aa', fontSize: 14 }} />
            <Tag color="success" style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
              Benchmark Complete
            </Tag>
          </div>
          <span className="text-[11px] text-text-secondary font-mono">
            {providers.length} providers · {totalIterations} iterations
          </span>
        </motion.div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-5">
        <MetricCard title="Avg Response Time" value={avgResponseTime} unit="ms" color="#5b8def" delay={0} />
        <MetricCard title="Avg Throughput" value={avgThroughput} unit="tok/s" color="#73bf69" delay={0.05} />
        <MetricCard title="Sys Throughput" value={avgSystemThroughput} unit="tok/s" color="#73bf69" delay={0.1} />
        <MetricCard title="Total Iterations" value={totalIterations} color="#a78bfa" delay={0.2} />
      </div>

      {/* Gauges */}
      <div className="glass-card p-7">
        <h3 className="data-label mb-5">Provider Performance</h3>
        <div className="flex justify-around flex-wrap gap-8">
          {providers.map((p) => (
            <div key={p} className="flex flex-col items-center gap-5">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: getProviderColor(p) }}
              >
                {getProviderDisplayName(p)}
              </span>
              <div className="flex gap-5">
                <NeonGauge
                  value={run.results[p]?.summary?.avgTokensPerSecond || 0}
                  max={Math.max(...providers.map((pr) => run.results[pr]?.summary?.avgTokensPerSecond || 1)) * 1.2}
                  label="Tok/s"
                  color={getProviderColor(p)}
                  size={100}
                />
                <NeonGauge
                  value={run.results[p]?.summary?.successRate * 100 || 0}
                  max={100}
                  label="Success"
                  color={getProviderColor(p)}
                  size={100}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <LiveChart results={run.results} metric="responseTime" title="Response Time per Iteration" unit="ms" />
        <LiveChart results={run.results} metric="tokensPerSecond" title="Tokens/Second per Iteration" unit="tok/s" />
      </div>

      <LiveChart results={run.results} metric="firstTokenLatency" title="First Token Latency per Iteration" unit="ms" />

      <RadarComparison results={run.results} />
    </motion.div>
  );
}

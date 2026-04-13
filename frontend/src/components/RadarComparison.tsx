import { motion } from 'framer-motion';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { ProviderResult, getProviderColor, getProviderDisplayName } from '../types';

interface RadarComparisonProps {
  results: Record<string, ProviderResult>;
}

export function RadarComparison({ results }: RadarComparisonProps) {
  const providers = Object.keys(results);
  if (providers.length === 0) return null;

  const metrics = ['Speed', 'Throughput', 'Latency', 'Cost Eff.', 'Reliability'];
  const maxValues = {
    speed: Math.max(...providers.map((p) => results[p]?.summary?.avgResponseTime || 1)),
    throughput: Math.max(...providers.map((p) => results[p]?.summary?.avgTokensPerSecond || 1)),
    latency: Math.max(...providers.map((p) => results[p]?.summary?.avgFirstTokenLatency || 1)),
    cost: Math.max(...providers.map((p) => results[p]?.summary?.estimatedCost || 0.0001)),
  };

  const data = metrics.map((metric) => {
    const point: Record<string, string | number> = { metric };
    providers.forEach((p) => {
      const summary = results[p]?.summary;
      if (!summary) {
        point[p] = 0;
        return;
      }

      switch (metric) {
        case 'Speed':
          point[p] = Math.round((1 - summary.avgResponseTime / maxValues.speed) * 100);
          break;
        case 'Throughput':
          point[p] = Math.round((summary.avgTokensPerSecond / maxValues.throughput) * 100);
          break;
        case 'Latency':
          point[p] = Math.round((1 - summary.avgFirstTokenLatency / maxValues.latency) * 100);
          break;
        case 'Cost Eff.':
          point[p] = Math.round((1 - summary.estimatedCost / maxValues.cost) * 100);
          break;
        case 'Reliability':
          point[p] = Math.round(summary.successRate * 100);
          break;
      }
    });
    return point;
  });

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-7">
      <h3 className="data-label mb-5">Provider Comparison</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <RadarChart data={data}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#8e8fa2', fontSize: 10, fontFamily: 'Inter' }} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: '#585a6e', fontSize: 8, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
            />
            {providers.map((p) => (
              <Radar
                key={p}
                name={getProviderDisplayName(p)}
                dataKey={p}
                stroke={getProviderColor(p)}
                fill={getProviderColor(p)}
                fillOpacity={0.1}
                strokeWidth={2}
              />
            ))}
            <Tooltip
              contentStyle={{
                background: '#1f1f1f',
                border: '1px solid #303030',
                borderRadius: '6px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-center gap-8 mt-3">
        {providers.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getProviderColor(p) }} />
            <span className="text-[11px] text-text-secondary font-mono">{getProviderDisplayName(p)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

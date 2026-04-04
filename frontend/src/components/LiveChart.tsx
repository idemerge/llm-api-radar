import { motion } from 'framer-motion';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { ProviderResult, getProviderColor, getProviderDisplayName } from '../types';

interface LiveChartProps {
  results: Record<string, ProviderResult>;
  metric: 'responseTime' | 'tokensPerSecond' | 'firstTokenLatency';
  title: string;
  unit: string;
}

export function LiveChart({ results, metric, title, unit }: LiveChartProps) {
  const providers = Object.keys(results);
  if (providers.length === 0) return null;

  const maxIterations = Math.max(
    ...providers.map((p) => results[p]?.iterations?.length || 0)
  );

  const data = Array.from({ length: maxIterations }, (_, i) => {
    const point: Record<string, number> = { iteration: i + 1 };
    providers.forEach((p) => {
      const iter = results[p]?.iterations?.[i];
      if (iter && iter.success) {
        point[p] = iter[metric];
      }
    });
    return point;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-7"
    >
      <h3 className="data-label mb-5">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={data}>
            <defs>
              {providers.map((p) => (
                <linearGradient key={p} id={`gradient-${p}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={getProviderColor(p)} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={getProviderColor(p)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="iteration"
              stroke="#585a6e"
              tick={{ fontSize: 10, fill: '#8e8fa2' }}
              className="font-mono"
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            />
            <YAxis
              stroke="#585a6e"
              tick={{ fontSize: 10, fill: '#8e8fa2' }}
              className="font-mono"
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            />
            <Tooltip
              contentStyle={{
                background: '#1f1f1f',
                border: '1px solid #303030',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
              }}
              wrapperClassName="font-mono"
              labelStyle={{ color: '#d8d9da' }}
              formatter={(value) => [`${value} ${unit}`, '']}
            />
            {providers.map((p) => (
              <Area
                key={p}
                type="monotone"
                dataKey={p}
                stroke={getProviderColor(p)}
                strokeWidth={2}
                fill={`url(#gradient-${p})`}
                dot={{ fill: getProviderColor(p), r: 2.5, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#000' }}
                name={getProviderDisplayName(p)}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

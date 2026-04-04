import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  color?: string;
  delay?: number;
}

export function MetricCard({ title, value, unit, icon, color = '#73bf69', delay = 0 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      className="glass-card p-4 relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="data-label text-[10px] whitespace-nowrap">{title}</span>
        {icon && <span className="text-base opacity-50">{icon}</span>}
      </div>

      <div className="flex items-baseline gap-1.5">
        <motion.span
          key={String(value)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="data-value text-xl"
          style={{ color }}
        >
          {value}
        </motion.span>
        {unit && (
          <span className="text-[11px] text-text-secondary font-medium font-mono">
            {unit}
          </span>
        )}
      </div>

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] opacity-30"
        style={{ backgroundColor: color }}
      />
    </motion.div>
  );
}

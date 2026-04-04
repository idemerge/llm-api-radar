import { motion } from 'framer-motion';
import { CapabilityTest } from '../types';
import { Card, Tag } from '../antdImports';

interface CapabilityTestsPanelProps {
  tests: CapabilityTest[] | undefined;
}

export function CapabilityTestsPanel({ tests }: CapabilityTestsPanelProps) {
  if (!tests || tests.length === 0) return null;

  const TypeIcon = ({ type }: { type: string }) => {
    const s = 16;
    switch (type) {
      case 'vision':
        return (
          <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className="text-accent-blue">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1 8C3 4 6 2 8 2s5 2 7 6c-2 4-5 6-7 6S3 12 1 8z" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        );
      case 'function_calling':
        return (
          <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className="text-accent-violet">
            <path d="M5 2L3 8l2 6M11 2l2 6-2 6M7 4l2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'json_mode':
        return (
          <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className="text-accent-amber">
            <path d="M4 2C3 2 2 3 2 4v2c0 1-1 2-1 2s1 1 1 2v2c0 1 1 2 2 2M12 2c1 0 2 1 2 2v2c0 1 1 2 1 2s-1 1-1 2v2c0 1-1 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        );
      case 'streaming':
        return (
          <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className="text-accent-teal">
            <path d="M2 4h4M2 8h8M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="13" cy="4" r="1.5" fill="currentColor" opacity="0.4" />
          </svg>
        );
      case 'non_streaming':
        return (
          <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className="text-accent-coral">
            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      default:
        return (
          <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className="text-text-secondary">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 6a2 2 0 1 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
          </svg>
        );
    }
  };

  const passedCount = tests.filter((t) => t.passed).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-7"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
          Capability Tests
        </h3>
        <span className="text-xs text-text-secondary font-mono">
          <span className="text-accent-teal">{passedCount}</span>/{tests.length} passed
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tests.map((test, i) => (
          <motion.div
            key={test.type}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card
              size="small"
              style={{ background: 'var(--bg-surface, #1a1b2e)', borderColor: 'var(--border, #2a2b3d)' }}
              bodyStyle={{ padding: '10px 12px' }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><TypeIcon type={test.type} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">
                      {test.name}
                    </span>
                    <Tag color={test.passed ? 'success' : 'error'} style={{ margin: 0, fontSize: 11 }}>
                      {test.passed ? 'PASS' : 'FAIL'}
                    </Tag>
                  </div>
                  <p className="text-xs text-text-secondary mb-1">{test.description}</p>
                  {test.latencyMs !== undefined && (
                    <p className="text-[10px] text-accent-blue font-mono mb-0.5">{test.latencyMs}ms</p>
                  )}
                  {test.details && (
                    <p className="text-[10px] text-text-secondary/60 font-mono truncate">
                      {test.details}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

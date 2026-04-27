import { Popconfirm, Tooltip } from '../antdImports';
import { DeleteOutlined, CloseOutlined, ClearOutlined } from '@ant-design/icons';
import { PlaygroundHistoryItem } from '../hooks/usePlaygroundHistory';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  items: PlaygroundHistoryItem[];
  loading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  selectedId?: string;
}

export function PlaygroundHistorySidebar({
  items,
  loading,
  onSelect,
  onDelete,
  onClearAll,
  onClose,
  selectedId,
}: Props) {
  return (
    <div className="w-80 shrink-0 glass-card p-4 space-y-3 self-start sticky top-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">History</span>
          {items.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono">
              {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <Popconfirm title="Clear all history?" onConfirm={onClearAll} okText="Clear" cancelText="Cancel">
              <Tooltip title="Clear all">
                <button className="text-[12px] text-text-tertiary hover:text-accent-rose transition-colors p-1">
                  <ClearOutlined />
                </button>
              </Tooltip>
            </Popconfirm>
          )}
          <button
            onClick={onClose}
            className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors p-1"
          >
            <CloseOutlined />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-200px)] pr-1">
        {loading && items.length === 0 && (
          <div className="text-center py-4 text-text-tertiary text-[12px] animate-pulse">Loading...</div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-center py-6 text-text-tertiary text-[12px]">
            No history yet. Run a prompt to see it here.
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item.id);
              }
            }}
            className={`w-full text-left rounded border p-2.5 transition-colors group cursor-pointer ${
              selectedId === item.id
                ? 'border-accent-blue/40 bg-accent-blue/5'
                : 'border-border hover:border-border-hover bg-transparent'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[11px] text-text-primary truncate max-w-[180px]">{item.modelName}</span>
              <div className="flex items-center gap-1.5">
                {item.responseTime && (
                  <span className="text-[10px] text-text-tertiary font-mono">
                    {item.responseTime < 1000 ? `${item.responseTime}ms` : `${(item.responseTime / 1000).toFixed(1)}s`}
                  </span>
                )}
                {item.error && <span className="w-1.5 h-1.5 rounded-full bg-accent-rose" />}
              </div>
            </div>
            <div className="text-[11px] text-text-secondary truncate mb-1">{item.promptSnippet}</div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-tertiary">{timeAgo(item.createdAt)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="text-[10px] text-text-tertiary hover:text-accent-rose opacity-0 group-hover:opacity-100 transition-all p-0.5"
              >
                <DeleteOutlined />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

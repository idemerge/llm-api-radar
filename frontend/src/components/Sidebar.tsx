import { Layout, Menu, Tooltip } from '../antdImports';
import { BarChartOutlined, HistoryOutlined, SettingOutlined, ExperimentOutlined, DashboardOutlined, LogoutOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { APP_VERSION } from '../constants';

const { Sider } = Layout;

export type PageType = 'workflow' | 'history' | 'history-detail' | 'settings' | 'playground' | 'monitor';

interface SidebarProps {
  activePage: PageType;
  onNavigate: (page: PageType) => void;
  isRunning?: boolean;
  runningLabel?: string;
  onLogout?: () => void;
}

export function getMenuItems() {
  return [
    {
      key: 'workflow',
      icon: <BarChartOutlined />,
      label: 'Workflow',
    },
    {
      key: 'history',
      icon: <HistoryOutlined />,
      label: 'History',
    },
    {
      key: 'monitor',
      icon: <DashboardOutlined />,
      label: 'Monitor',
    },
    {
      key: 'playground',
      icon: <ExperimentOutlined />,
      label: 'Playground',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
  ];
}

export function Sidebar({ activePage, onNavigate, isRunning, runningLabel, onLogout }: SidebarProps) {
  const items = getMenuItems();

  return (
    <Sider
      width={200}
      theme="dark"
      style={{
        position: 'fixed',
        height: '100vh',
        left: 0,
        top: 0,
        bottom: 0,
        overflow: 'auto',
        zIndex: 100,
        background: '#141414',
      }}
    >
      {/* Logo */}
      <div className="px-4 py-5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded bg-accent-teal flex items-center justify-center text-bg-primary text-xs font-bold flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="7" width="4" height="6" rx="1" fill="currentColor" opacity="0.9" />
            <rect x="5" y="4" width="4" height="9" rx="1" fill="currentColor" />
            <rect x="9" y="1" width="4" height="12" rx="1" fill="currentColor" opacity="0.9" />
          </svg>
        </div>
        <div>
          <div className="text-[13px] font-semibold text-text-primary leading-none">LLM API Radar</div>
          <div className="text-[9px] text-text-tertiary mt-0.5 font-mono">{APP_VERSION}</div>
        </div>
      </div>

      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[activePage === 'history-detail' ? 'history' : activePage]}
        onClick={({ key }) => onNavigate(key as PageType)}
        items={items}
        style={{ borderRight: 0 }}
      />

      {/* Status Footer */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-3 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-[6px] h-[6px] rounded-full ${isRunning ? 'bg-accent-amber neon-pulse' : 'bg-text-tertiary'}`} />
            <span className={`text-[11px] font-medium font-mono ${isRunning ? 'text-accent-amber' : 'text-text-tertiary'}`}>
              {isRunning ? runningLabel || 'Running...' : 'Ready'}
            </span>
          </div>
          {onLogout && (
            <Tooltip title="Sign out">
              <button
                onClick={onLogout}
                className="text-text-tertiary hover:text-text-primary transition-colors p-1"
                aria-label="Sign out"
              >
                <LogoutOutlined style={{ fontSize: 13 }} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </Sider>
  );
}

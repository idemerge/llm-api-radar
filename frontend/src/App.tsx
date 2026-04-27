import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ConfigProvider from 'antd/es/config-provider';
import theme from 'antd/es/theme';
import { Layout, Menu, Drawer } from './antdImports';
import { MenuOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar, PageType, getMenuItems } from './components/Sidebar';
import { HistoryPanel } from './components/HistoryPanel';
import { HistoryDetailPage } from './components/HistoryDetailPage';
import { WorkflowConfigPanel } from './components/WorkflowConfigPanel';
import { WorkflowProgress } from './components/WorkflowProgress';
import { WorkflowResults } from './components/WorkflowResults';
import { WorkflowHeader } from './components/WorkflowHeader';
import { SettingsPage } from './components/SettingsPage';
import { PlaygroundPage } from './components/PlaygroundPage';
import { MonitorPage } from './components/MonitorPage';
import { LoginPage } from './components/LoginPage';
import { useWorkflow } from './hooks/useWorkflow';
import { isAuthenticated, clearToken } from './services/api';
import { BenchmarkWorkflow } from './types';
import { APP_VERSION } from './constants';
import { apiFetch } from './services/api';

function pathnameToPage(pathname: string): PageType | 'login' {
  if (pathname === '/login') return 'login';
  if (pathname.match(/^\/history\/[a-zA-Z0-9_-]+/)) return 'history-detail';
  if (pathname.startsWith('/history')) return 'history';
  if (pathname.startsWith('/monitor')) return 'monitor';
  if (pathname.startsWith('/playground')) return 'playground';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'workflow';
}

function getHistoryDetailId(pathname: string): string | null {
  const match = pathname.match(/^\/history\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

const PAGE_ROUTES: Record<string, string> = {
  workflow: '/workflow',
  history: '/history',
  'history-detail': '/history',
  playground: '/playground',
  monitor: '/monitor',
  settings: '/settings',
};

const pageConfig: Record<string, { title: string; subtitle: string }> = {
  workflow: { title: 'Workflow', subtitle: 'Configure and run LLM API benchmarks' },
  history: { title: 'History', subtitle: 'Browse past workflow results' },
  'history-detail': { title: 'Workflow Detail', subtitle: 'View workflow results' },
  playground: { title: 'Playground', subtitle: 'Test model connections and view responses' },
  monitor: { title: 'Monitor', subtitle: 'API health and latency monitoring' },
  settings: { title: 'Settings', subtitle: 'API keys and preferences' },
};

function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  // Listen for auth expiry events from apiFetch
  useEffect(() => {
    const handler = () => {
      setAuthed(false);
      // Navigate to login, preserving current path as returnTo
      const current = window.location.pathname;
      if (current !== '/login') {
        window.history.replaceState(null, '', `/login?returnTo=${encodeURIComponent(current)}`);
      }
    };
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
  }, []);

  const {
    workflows,
    currentWorkflow,
    templates,
    isRunning: isWorkflowRunning,
    error: workflowError,
    startWorkflow,
    fetchWorkflows,
    fetchTemplates,
    cancelWorkflow,
    exportWorkflow,
    deleteWorkflow,
    clearError: clearWorkflowError,
    reconnectActiveWorkflow,
    workflowsLoaded,
    taskProgress,
    liveMetrics,
    cooldown,
  } = useWorkflow();

  const navigate = useNavigate();
  const location = useLocation();
  const activePage = pathnameToPage(location.pathname);
  const historyDetailId = getHistoryDetailId(location.pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workflowToDuplicate, setWorkflowToDuplicate] = useState<BenchmarkWorkflow | null>(null);
  const prevRunningRef = useRef(false);

  const handleDuplicateWorkflow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/workflows/${id}`);
        const data = await res.json();
        setWorkflowToDuplicate(data);
        navigate('/workflow', { replace: true });
      } catch {
        /* ignore */
      }
    },
    [navigate],
  );

  const handleDuplicateConsumed = useCallback(() => {
    setWorkflowToDuplicate(null);
  }, []);

  useEffect(() => {
    if (!authed) {
      // Redirect to /login with returnTo if not already on login page
      if (location.pathname !== '/login') {
        navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
      }
      return;
    }
    if (location.pathname === '/' || location.pathname === '/benchmark' || location.pathname === '/login') {
      navigate('/workflow', { replace: true });
    }
  }, [authed, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!authed) return;
    fetchWorkflows();
    fetchTemplates();
    reconnectActiveWorkflow().then((reconnected) => {
      if (reconnected) {
        prevRunningRef.current = true;
      }
    });
  }, [authed, fetchWorkflows, fetchTemplates, reconnectActiveWorkflow]);

  // Reload workflows when navigating to history page; auto-refresh every 30s if any workflow is running
  const hasRunningRef = useRef(false);
  useEffect(() => {
    hasRunningRef.current = workflows.some((w) => w.status === 'running');
  }, [workflows]);

  useEffect(() => {
    if (!authed || activePage !== 'history') return;
    fetchWorkflows();
    if (!hasRunningRef.current) return;
    const timer = setInterval(() => fetchWorkflows(), 30000);
    return () => clearInterval(timer);
  }, [authed, activePage, fetchWorkflows]);

  useEffect(() => {
    if (isWorkflowRunning && !prevRunningRef.current) {
      navigate('/workflow', { replace: true });
    }
    prevRunningRef.current = isWorkflowRunning;
  }, [isWorkflowRunning, navigate]);

  if (!authed) {
    const params = new URLSearchParams(location.search);
    const returnTo = params.get('returnTo') || '/workflow';
    return (
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#4096ff',
            colorBgBase: '#141414',
            colorBgContainer: '#141414',
            colorBgElevated: '#1f1f1f',
            colorBgLayout: '#000',
            colorText: 'rgba(255, 255, 255, 0.88)',
            colorTextSecondary: 'rgba(255, 255, 255, 0.65)',
            colorTextTertiary: 'rgba(255, 255, 255, 0.45)',
            colorBorder: '#303030',
            colorBorderSecondary: '#303030',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            borderRadius: 4,
          },
          components: {
            Input: {
              colorBgContainer: '#0a0a0a',
              activeBorderColor: '#4096ff',
              activeShadow: '0 0 0 2px rgba(64, 150, 255, 0.15)',
            },
            Alert: {
              colorErrorBg: 'rgba(242, 73, 92, 0.1)',
              colorErrorBorder: 'rgba(242, 73, 92, 0.2)',
            },
          },
        }}
      >
        <LoginPage
          onLoginSuccess={() => {
            setAuthed(true);
            navigate(returnTo, { replace: true });
          }}
        />
      </ConfigProvider>
    );
  }

  const handleHistorySelect = (id: string) => {
    navigate('/history/' + id);
  };

  // Recent workflow card click -> navigate to detail
  const handleRecentWorkflowClick = (id: string) => {
    navigate('/history/' + id);
  };

  const isRunning = isWorkflowRunning;
  const runningLabel = isWorkflowRunning ? 'Workflow Running' : undefined;
  const error = workflowError;

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          // Colors — aligned with Ant Design dark theme
          colorPrimary: '#4096ff',
          colorSuccess: '#73bf69',
          colorWarning: '#ff9830',
          colorError: '#f2495c',
          colorInfo: '#4096ff',

          // Backgrounds — Ant dark standard
          colorBgBase: '#141414',
          colorBgContainer: '#141414',
          colorBgElevated: '#1f1f1f',
          colorBgLayout: '#000',

          // Text — Ant dark standard
          colorText: 'rgba(255, 255, 255, 0.88)',
          colorTextSecondary: 'rgba(255, 255, 255, 0.65)',
          colorTextTertiary: 'rgba(255, 255, 255, 0.45)',

          // Borders — Ant dark standard
          colorBorder: '#303030',
          colorBorderSecondary: '#303030',

          // Typography
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontFamilyCode: "'JetBrains Mono', monospace",
          fontSize: 14,

          // Shape
          borderRadius: 4,
          borderRadiusLG: 6,
          borderRadiusSM: 2,
        },
        components: {
          Button: {
            colorPrimaryHover: '#5ba0ff',
            primaryShadow: 'none',
            defaultBorderColor: '#424242',
            defaultColor: 'rgba(255, 255, 255, 0.88)',
          },
          Table: {
            headerBg: '#141414',
            rowHoverBg: 'rgba(64, 150, 255, 0.08)',
          },
          Input: {
            colorBgContainer: '#0a0a0a',
            activeBorderColor: '#4096ff',
            activeShadow: '0 0 0 2px rgba(64, 150, 255, 0.15)',
          },
          InputNumber: {
            colorBgContainer: '#0a0a0a',
            activeBorderColor: '#4096ff',
            activeShadow: '0 0 0 2px rgba(64, 150, 255, 0.15)',
          },
          Select: {
            colorBgContainer: '#0a0a0a',
          },
          Card: {
            colorBgContainer: '#141414',
          },
          Modal: {
            contentBg: '#1f1f1f',
            headerBg: '#1f1f1f',
          },
          Menu: {
            darkItemBg: '#141414',
            darkSubMenuItemBg: '#0a0a0a',
            darkItemSelectedBg: 'rgba(64, 150, 255, 0.15)',
          },
          Tabs: {
            cardBg: '#141414',
            itemColor: 'rgba(255, 255, 255, 0.65)',
            itemSelectedColor: 'rgba(255, 255, 255, 0.88)',
            itemHoverColor: 'rgba(255, 255, 255, 0.88)',
            inkBarColor: '#4096ff',
          },
          Tag: {
            defaultBg: 'rgba(255, 255, 255, 0.08)',
            defaultColor: 'rgba(255, 255, 255, 0.65)',
          },
          Progress: {
            remainingColor: 'rgba(255, 255, 255, 0.06)',
          },
          Switch: {
            colorPrimary: '#73bf69',
            handleBg: '#d8d9da',
          },
          Alert: {
            colorErrorBg: 'rgba(242, 73, 92, 0.1)',
            colorErrorBorder: 'rgba(242, 73, 92, 0.2)',
            colorWarningBg: 'rgba(255, 152, 48, 0.1)',
            colorWarningBorder: 'rgba(255, 152, 48, 0.2)',
            colorSuccessBg: 'rgba(115, 191, 105, 0.1)',
            colorSuccessBorder: 'rgba(115, 191, 105, 0.2)',
          },
          Form: {
            labelColor: 'rgba(255, 255, 255, 0.65)',
            labelFontSize: 12,
          },
          Segmented: {
            itemSelectedBg: '#303030',
            itemSelectedColor: 'rgba(255, 255, 255, 0.95)',
            trackBg: '#1a1a1a',
          },
          Collapse: {
            headerBg: '#141414',
            contentBg: '#1f1f1f',
          },
          Steps: {
            colorPrimary: '#8a6dff',
          },
          Popconfirm: {
            colorWarning: '#f2495c',
          },
          Timeline: {
            dotBg: 'transparent',
          },
          Drawer: {
            colorBgElevated: '#141414',
          },
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sidebar
          activePage={activePage === 'login' ? 'workflow' : activePage}
          onNavigate={(page) => navigate(PAGE_ROUTES[page])}
          isRunning={isRunning}
          runningLabel={runningLabel}
          onLogout={() => {
            clearToken();
            setAuthed(false);
            navigate('/login', { replace: true });
          }}
        />

        {/* Mobile navigation drawer */}
        <Drawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          placement="left"
          styles={{
            wrapper: { width: 240 },
            header: { background: '#141414', borderBottom: '1px solid #303030' },
            body: { background: '#141414', padding: 0 },
          }}
          title={
            <div className="flex items-center gap-2.5">
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
          }
        >
          <Menu
            mode="inline"
            theme="dark"
            selectedKeys={[activePage === 'history-detail' ? 'history' : activePage]}
            onClick={({ key }) => {
              navigate(PAGE_ROUTES[key]);
              setMobileMenuOpen(false);
            }}
            items={getMenuItems()}
            style={{ borderRight: 0, background: '#141414' }}
          />
        </Drawer>

        <Layout className="app-layout-main" style={{ marginLeft: 200 }}>
          {/* Top bar */}
          <Layout.Header
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              padding: '0 24px',
              height: 56,
              lineHeight: '56px',
              backdropFilter: 'blur(12px)',
              background: 'rgba(0, 0, 0, 0.8)',
              borderBottom: '1px solid #303030',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div className="flex items-center gap-3">
              <button
                className="md:hidden text-text-secondary hover:text-text-primary p-1"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
              >
                <MenuOutlined style={{ fontSize: 18 }} />
              </button>
              <h1 className="app-topbar-title">{(pageConfig[activePage] || { title: 'Dashboard' }).title}</h1>
              <span className="text-[12px] text-text-tertiary hidden sm:inline">
                {(pageConfig[activePage] || { subtitle: '' }).subtitle}
              </span>
            </div>
            <div className="flex items-center gap-3" />
          </Layout.Header>

          {/* Content */}
          <Layout.Content className="app-content">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 rounded bg-accent-rose/10 border border-accent-rose/20 text-accent-rose text-sm flex items-center justify-between"
              >
                <span className="font-medium text-[13px]">{error}</span>
                <button
                  onClick={() => {
                    clearWorkflowError();
                    window.location.reload();
                  }}
                  className="text-xs underline hover:no-underline ml-4 opacity-70 hover:opacity-100"
                >
                  Dismiss
                </button>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {activePage === 'workflow' && (
                <motion.div
                  key="workflow"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="space-y-6"
                >
                  {/* Getting Started Hint */}
                  {!currentWorkflow && !isWorkflowRunning && workflows.length === 0 && (
                    <div className="p-4 rounded-md border border-accent-blue/20 bg-accent-blue/5 flex items-start gap-3">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                        className="text-accent-blue flex-shrink-0 mt-0.5"
                      >
                        <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M9 5v5M9 12.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <div>
                        <p className="text-sm text-text-primary font-medium mb-1">Getting Started</p>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          1. Choose a template or name your workflow &nbsp; 2. Select providers to benchmark &nbsp; 3.
                          Configure tasks (prompt, concurrency, iterations) &nbsp; 4. Click Start to run all tasks
                          sequentially and compare results.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Config Panel — full width */}
                  <WorkflowConfigPanel
                    onStart={startWorkflow}
                    isRunning={isWorkflowRunning}
                    templates={templates}
                    onCancel={currentWorkflow ? () => cancelWorkflow(currentWorkflow.id) : undefined}
                    initialWorkflow={workflowToDuplicate}
                    onInitialWorkflowConsumed={handleDuplicateConsumed}
                  />

                  {/* Live Progress & Results */}
                  {currentWorkflow && (
                    <WorkflowHeader workflow={currentWorkflow} onCancel={cancelWorkflow} onExport={exportWorkflow} />
                  )}
                  {currentWorkflow && (
                    <WorkflowProgress
                      workflow={currentWorkflow}
                      taskProgress={taskProgress}
                      liveMetrics={liveMetrics}
                      cooldown={cooldown}
                    />
                  )}
                  {currentWorkflow?.summary && <WorkflowResults workflow={currentWorkflow} onExport={exportWorkflow} />}

                  {/* Recent Workflows */}
                  {!currentWorkflow && !isWorkflowRunning && workflows.length > 0 && (
                    <div className="glass-card p-5 space-y-3">
                      <h3 className="text-sm font-medium text-text-primary">Recent Workflows</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                        {workflows.slice(0, 9).map((wf) => (
                          <button
                            key={wf.id}
                            onClick={() => handleRecentWorkflowClick(wf.id)}
                            className="w-full text-left p-3 rounded border border-border bg-bg-surface hover:border-accent-violet/30 transition-all flex items-center gap-3"
                          >
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                                wf.status === 'completed'
                                  ? 'bg-accent-teal/10 text-accent-teal'
                                  : wf.status === 'failed'
                                    ? 'bg-accent-rose/10 text-accent-rose'
                                    : wf.status === 'running'
                                      ? 'bg-accent-amber/10 text-accent-amber'
                                      : 'bg-white/5 text-text-secondary'
                              }`}
                            >
                              {wf.status}
                            </span>
                            <span className="text-[13px] text-text-primary flex-1 truncate">{wf.name}</span>
                            <span className="text-[11px] text-text-tertiary font-mono">{wf.tasks.length} tasks</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activePage === 'history' && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <HistoryPanel
                    workflows={workflows}
                    onSelectWorkflow={handleHistorySelect}
                    onDeleteWorkflow={deleteWorkflow}
                    onDuplicateWorkflow={handleDuplicateWorkflow}
                    onRefresh={fetchWorkflows}
                    loading={!workflowsLoaded}
                  />
                </motion.div>
              )}

              {activePage === 'history-detail' && historyDetailId && (
                <motion.div
                  key={`history-detail-${historyDetailId}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <HistoryDetailPage
                    workflowId={historyDetailId}
                    onExport={exportWorkflow}
                    onCancel={cancelWorkflow}
                    onBack={() => navigate('/history')}
                  />
                </motion.div>
              )}

              {activePage === 'playground' && (
                <motion.div
                  key="playground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <PlaygroundPage />
                </motion.div>
              )}

              {activePage === 'monitor' && (
                <motion.div
                  key="monitor"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <MonitorPage />
                </motion.div>
              )}

              {activePage === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <SettingsPage />
                </motion.div>
              )}
            </AnimatePresence>
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;

import { useState, useEffect, useMemo, useRef } from 'react';
import { Select, Input, InputNumber, Switch, Button, Collapse, Alert, Tooltip } from '../antdImports';
import {
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  WarningOutlined,
  CodeOutlined,
  BulbOutlined,
  PlusOutlined,
  DeleteOutlined,
  LinkOutlined,
  CopyOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { HistoryOutlined } from '@ant-design/icons';
import { useProviders } from '../hooks/useProviders';
import { usePlayground, PlaygroundMetrics } from '../hooks/usePlayground';
import { usePlaygroundHistory } from '../hooks/usePlaygroundHistory';
import { PlaygroundHistorySidebar } from './PlaygroundHistorySidebar';
import { ImageInput } from '../types';
import { PRESET_PROMPTS, QUICK_MAX_TOKENS } from '../constants';

const { TextArea } = Input;

const STANDARD_PRESETS = PRESET_PROMPTS.filter(p => !p.label.startsWith('Long Context'));
const LONG_CONTEXT_PRESETS = PRESET_PROMPTS.filter(p => p.label.startsWith('Long Context'));

export function PlaygroundPage() {
  const { providers, fetchProviders } = useProviders();
  const {
    loading, streaming, responseText, reasoningText, metrics, error,
    runPrompt, streamPrompt, abort, reset, restore,
  } = usePlayground();
  const { items: historyItems, loading: historyLoading, fetchHistory, getDetail, deleteEntry, clearAll } = usePlaygroundHistory();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [useStreaming, setUseStreaming] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showLongContext, setShowLongContext] = useState(false);
  const [copied, setCopied] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevLoadingRef = useRef(false);

  useEffect(() => { fetchProviders(); fetchHistory(); }, [fetchProviders, fetchHistory]);

  // Auto-refresh history after a run completes
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      fetchHistory();
    }
    prevLoadingRef.current = loading;
  }, [loading, fetchHistory]);

  const selectedProvider = useMemo(
    () => providers.find(p => p.id === providerId),
    [providers, providerId],
  );

  const activeModels = useMemo(
    () => (selectedProvider?.models || []).filter(m => m.isActive !== false),
    [selectedProvider],
  );

  useEffect(() => {
    if (activeModels.length > 0 && !activeModels.find(m => m.name === modelName)) {
      setModelName(activeModels[0].name);
    }
  }, [activeModels, modelName]);

  const canRun = providerId && modelName && prompt.trim();

  const handleRun = () => {
    if (!canRun) return;
    setHasRun(true);
    const params = {
      providerId: providerId!,
      modelName: modelName!,
      prompt: prompt.trim(),
      systemPrompt: systemPrompt.trim() || undefined,
      maxTokens,
      images: images.length > 0 ? images : undefined,
      enableThinking: enableThinking || undefined,
    };
    if (useStreaming) {
      streamPrompt(params);
    } else {
      runPrompt(params);
    }
  };

  const handleAddImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    setImages(prev => [...prev, { type: 'url', url }]);
    setImageUrlInput('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 10 * 1024 * 1024) return; // 10MB limit
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setImages(prev => [...prev, {
          type: 'base64',
          mediaType: file.type,
          data: base64,
        }]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleCopyResponse = async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const handleSelectHistory = async (id: string) => {
    const detail = await getDetail(id);
    if (!detail) return;
    setSelectedHistoryId(id);
    setProviderId(detail.providerId);
    setModelName(detail.modelName);
    setPrompt(detail.prompt);
    setSystemPrompt(detail.systemPrompt || '');
    setMaxTokens(detail.maxTokens);
    setUseStreaming(detail.useStreaming);
    setEnableThinking(detail.enableThinking);
    setHasRun(true);
    restore({
      responseText: detail.responseText,
      reasoningText: detail.reasoningText,
      metrics: detail.metrics,
    });
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 space-y-4">
      {/* Config */}
      <div className="glass-card p-5 space-y-4">
        {/* Header with History toggle */}
        <div className="flex items-center justify-end -mt-1 -mb-2">
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className={`text-[12px] flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
              historyOpen ? 'text-accent-blue' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <HistoryOutlined />
            History
            {historyItems.length > 0 && (
              <span className="text-[10px] px-1 py-0 rounded bg-white/8 font-mono">{historyItems.length}</span>
            )}
          </button>
        </div>

        {/* Provider & Model — stacks on mobile */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-[12px] text-text-tertiary mb-1.5 uppercase tracking-wider">Provider</label>
            <Select
              className="w-full"
              placeholder="Select provider"
              value={providerId}
              onChange={(val) => { setProviderId(val); setModelName(null); }}
              options={providers.map(p => ({
                value: p.id,
                label: (
                  <span className="flex items-center gap-2">
                    <span>{p.name}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono">{p.format}</span>
                  </span>
                ),
              }))}
            />
          </div>
          <div className="flex-1">
            <label className="block text-[12px] text-text-tertiary mb-1.5 uppercase tracking-wider">Model</label>
            <Select
              className="w-full"
              placeholder={providerId ? 'Select model' : 'Select provider first'}
              disabled={!providerId}
              value={modelName}
              onChange={setModelName}
              options={activeModels.map(m => ({
                value: m.name,
                label: (
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[13px]">{m.displayName || m.name}</span>
                    <span className="text-[11px] text-text-tertiary">{Math.round(m.contextSize / 1000)}K</span>
                    {m.supportsVision && <span className="text-[10px] px-1 rounded bg-accent-teal/15 text-accent-teal">V</span>}
                    {m.supportsTools && <span className="text-[10px] px-1 rounded bg-accent-blue/15 text-accent-blue">T</span>}
                  </span>
                ),
              }))}
            />
          </div>
        </div>

        {/* System Prompt */}
        <Collapse
          ghost
          items={[{
            key: 'system',
            label: <span className="text-[12px] text-text-secondary">System Prompt</span>,
            children: (
              <TextArea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="Optional system instructions..."
                autoSize={{ minRows: 2, maxRows: 6 }}
                className="font-mono text-[13px]"
              />
            ),
          }]}
        />

        {/* Prompt */}
        <div>
          <label className="block text-[12px] text-text-tertiary mb-1.5 uppercase tracking-wider">Prompt</label>
          <TextArea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Enter your prompt..."
            autoSize={{ minRows: 4, maxRows: 12 }}
            className="font-mono text-[13px]"
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canRun && !loading) {
                handleRun();
              }
            }}
          />
        </div>

        {/* Images */}
        <Collapse
          ghost
          items={[{
            key: 'images',
            label: (
              <span className="text-[12px] text-text-secondary flex items-center gap-2">
                Images
                {images.length > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent-teal/15 text-accent-teal">{images.length}</span>
                )}
              </span>
            ),
            children: (
              <div className="space-y-3">
                {/* URL Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/image.png"
                    value={imageUrlInput}
                    onChange={e => setImageUrlInput(e.target.value)}
                    onPressEnter={handleAddImageUrl}
                    prefix={<LinkOutlined className="text-text-tertiary" />}
                    className="flex-1"
                    size="small"
                  />
                  <Button size="small" onClick={handleAddImageUrl} disabled={!imageUrlInput.trim()}>
                    Add URL
                  </Button>
                </div>
                {/* File Upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Image
                </Button>
                {/* Image Previews */}
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {images.map((img, i) => (
                      <div
                        key={i}
                        className="relative group rounded border border-border overflow-hidden"
                        style={{ width: 80, height: 80 }}
                      >
                        <img
                          src={
                            img.type === 'url' ? img.url!
                            : `data:${img.mediaType};base64,${img.data}`
                          }
                          alt={`Image ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removeImage(i)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        >
                          <DeleteOutlined style={{ fontSize: 10 }} />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-text-secondary text-center py-0.5">
                          {img.type === 'url' ? 'URL' : img.mediaType?.split('/')[1]?.toUpperCase()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          }]}
        />

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {STANDARD_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => setPrompt(preset.prompt)}
              className="text-[11px] px-2.5 py-1 rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent-blue/40 transition-colors"
            >
              {preset.label}
            </button>
          ))}
          {!showLongContext ? (
            <button
              onClick={() => setShowLongContext(true)}
              className="text-[11px] px-2.5 py-1 rounded border border-border text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Long Context...
            </button>
          ) : (
            LONG_CONTEXT_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => setPrompt(preset.prompt)}
                className="text-[11px] px-2.5 py-1 rounded border border-accent-amber/30 text-accent-amber/80 hover:text-accent-amber hover:border-accent-amber/50 transition-colors"
              >
                {preset.label}
              </button>
            ))
          )}
        </div>

        {/* Config Row — wraps to vertical on small screens */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-text-tertiary">Max Tokens</label>
            <InputNumber min={1} max={128000} value={maxTokens} onChange={v => v && setMaxTokens(v)} size="small" className="w-24" />
            <div className="flex gap-1">
              {QUICK_MAX_TOKENS.map(q => (
                <button
                  key={q.value}
                  onClick={() => setMaxTokens(q.value)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    maxTokens === q.value
                      ? 'border-accent-blue/50 text-accent-blue bg-accent-blue/10'
                      : 'border-border text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip title="Streaming mode shows text as it arrives. Non-streaming waits for the full response.">
              <label className="text-[12px] text-text-tertiary cursor-help">Streaming</label>
            </Tooltip>
            <Switch size="small" checked={useStreaming} onChange={setUseStreaming} />
          </div>
          <div className="flex items-center gap-2">
            <Tooltip title="Enable extended thinking (Anthropic/OpenAI o-series). Shows the model's reasoning process. Disables system prompt for Anthropic.">
              <label className="text-[12px] text-text-tertiary cursor-help">Thinking</label>
            </Tooltip>
            <Switch size="small" checked={enableThinking} onChange={setEnableThinking} />
          </div>
        </div>

        {/* Run / Stop */}
        {loading ? (
          <Button type="default" danger block icon={<StopOutlined />} onClick={abort} size="large">
            Stop
          </Button>
        ) : (
          <Tooltip title={canRun ? 'Cmd+Enter' : undefined}>
            <Button type="primary" block icon={<SendOutlined />} onClick={handleRun} disabled={!canRun} size="large">
              Run
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => reset()} showIcon />
      )}

      {/* Response */}
      {(hasRun || loading) && (
        <div className="glass-card p-5 space-y-4">
          <MetricsRow metrics={metrics} loading={loading} />

          {/* Reasoning */}
          {reasoningText && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BulbOutlined className="text-accent-violet text-[13px]" />
                <span className="text-[12px] text-text-tertiary uppercase tracking-wider">Reasoning</span>
              </div>
              <div className="rounded border border-accent-violet/20 bg-accent-violet/5 p-4 overflow-auto max-h-[300px]">
                <pre className="whitespace-pre-wrap text-[13px] leading-relaxed font-mono text-text-secondary m-0">
                  {reasoningText}
                  {streaming && !metrics && <span className="animate-pulse text-accent-violet">|</span>}
                </pre>
              </div>
            </div>
          )}

          {/* Response Text */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CodeOutlined className="text-accent-teal text-[13px]" />
              <span className="text-[12px] text-text-tertiary uppercase tracking-wider">Response</span>
              {selectedProvider && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono ml-auto">
                  {selectedProvider.name} / {modelName} ({selectedProvider.format})
                </span>
              )}
              {responseText && !loading && (
                <button
                  onClick={handleCopyResponse}
                  className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors ml-1"
                  title="Copy response"
                >
                  {copied ? <CheckOutlined className="text-accent-teal" /> : <CopyOutlined />}
                </button>
              )}
            </div>
            <div className="rounded border border-border bg-[#0a0a0a] p-4 overflow-auto max-h-[600px] min-h-[100px]">
              {responseText ? (
                <pre className="whitespace-pre-wrap text-[13px] leading-relaxed font-mono text-text-primary m-0">
                  {responseText}
                  {streaming && !metrics && <span className="animate-pulse text-accent-blue">|</span>}
                </pre>
              ) : loading ? (
                <div className="flex items-center gap-2 text-text-tertiary text-[13px]">
                  <span className="animate-pulse">{streaming ? 'Streaming...' : 'Waiting for response...'}</span>
                </div>
              ) : (
                <span className="text-text-tertiary text-[13px] italic">
                  {metrics ? 'No response text (model may use reasoning-only output)' : 'No response yet'}
                </span>
              )}
            </div>
          </div>

          {/* Debug */}
          {metrics && (
            <Collapse
              ghost
              items={[{
                key: 'debug',
                label: <span className="text-[12px] text-text-secondary">Debug Details</span>,
                children: (
                  <pre className="whitespace-pre-wrap text-[11px] font-mono text-text-secondary bg-[#0a0a0a] p-3 rounded overflow-auto max-h-[300px] m-0">
                    {JSON.stringify({
                      request: {
                        provider: selectedProvider?.name,
                        format: selectedProvider?.format,
                        endpoint: selectedProvider?.endpoint,
                        model: modelName,
                        maxTokens,
                        streaming: useStreaming,
                        promptLength: prompt.length,
                        images: images.length,
                      },
                      response: {
                        ...metrics,
                        textLength: responseText.length,
                        reasoningTextLength: reasoningText.length,
                      },
                    }, null, 2)}
                  </pre>
                ),
              }]}
            />
          )}
        </div>
      )}
      </div>

      {/* History Sidebar */}
      {historyOpen && (
        <PlaygroundHistorySidebar
          items={historyItems}
          loading={historyLoading}
          onSelect={handleSelectHistory}
          onDelete={deleteEntry}
          onClearAll={clearAll}
          onClose={() => setHistoryOpen(false)}
          selectedId={selectedHistoryId}
        />
      )}
    </div>
  );
}

function MetricsRow({ metrics, loading }: { metrics: PlaygroundMetrics | null; loading: boolean }) {
  const cards = [
    {
      label: 'Response Time',
      value: metrics ? `${metrics.responseTime.toLocaleString()} ms` : '--',
      icon: <ClockCircleOutlined />,
      color: 'text-accent-blue',
    },
    {
      label: 'First Token',
      value: metrics ? (metrics.firstTokenLatency > 0 ? `${metrics.firstTokenLatency.toLocaleString()} ms` : 'N/A') : '--',
      icon: <ThunderboltOutlined />,
      color: 'text-accent-amber',
    },
    {
      label: 'TPS',
      value: metrics ? `${metrics.tokensPerSecond}` : '--',
      icon: <DashboardOutlined />,
      color: metrics?.tokensPerSecond === 0 && metrics?.outputTokens === 0
        ? 'text-accent-rose' : 'text-accent-teal',
      warn: metrics?.tokensPerSecond === 0 && metrics?.outputTokens === 0,
    },
    {
      label: 'Tokens',
      value: metrics ? `${metrics.inputTokens} in / ${metrics.outputTokens} out` : '--',
      icon: metrics?.outputTokens === 0 ? <WarningOutlined /> : null,
      color: metrics?.outputTokens === 0 ? 'text-accent-rose' : 'text-text-primary',
      warn: metrics?.outputTokens === 0,
      sublabel: metrics?.reasoningTokens ? `(${metrics.reasoningTokens} reasoning)` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className={`rounded border p-3 ${
            card.warn ? 'border-accent-rose/30 bg-accent-rose/5' : 'border-border bg-[#0a0a0a]'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            {card.icon && <span className={`text-[12px] ${card.color}`}>{card.icon}</span>}
            <span className="text-[11px] text-text-tertiary uppercase tracking-wider">{card.label}</span>
          </div>
          <div className={`text-[16px] font-mono font-medium ${card.color} ${loading && !metrics ? 'animate-pulse' : ''}`}>
            {card.value}
          </div>
          {card.sublabel && <div className="text-[11px] text-text-tertiary mt-0.5">{card.sublabel}</div>}
          {card.warn && (
            <div className="text-[11px] text-accent-rose mt-1 flex items-center gap-1">
              <WarningOutlined className="text-[11px]" />
              No token data from API
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

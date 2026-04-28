import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Select, Input, InputNumber, Switch, Collapse, Alert, Tooltip } from '../antdImports';
import {
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  WarningOutlined,
  CodeOutlined,
  BulbOutlined,
  DeleteOutlined,
  PictureOutlined,
  CopyOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { HistoryOutlined } from '@ant-design/icons';
import { useProviders } from '../hooks/useProviders';
import { usePlayground, PlaygroundMetrics } from '../hooks/usePlayground';
import { usePlaygroundHistory } from '../hooks/usePlaygroundHistory';
import { PlaygroundHistorySidebar } from './PlaygroundHistorySidebar';
import { ImageInput, getProviderColor } from '../types';
import {
  PRESET_PROMPTS,
  QUICK_MAX_TOKENS,
  loadHeavyPreset,
  OUTPUT_SCOPE_OPTIONS,
  applyOutputScope,
  getStoredOutputScope,
  storeOutputScope,
  getStoredMaxTokens,
  storeMaxTokens,
} from '../constants';
import { useTokenCount } from '../utils/tokenCount';

const { TextArea } = Input;

const STANDARD_PRESETS = PRESET_PROMPTS.filter((p) => p.category === 'standard');
const SHAREGPT_PRESETS = PRESET_PROMPTS.filter((p) => p.category === 'long-context');

const PROVIDER_STORAGE_KEY = 'llm-radar:playground-provider';
const MODEL_STORAGE_KEY = 'llm-radar:playground-model';

function getStoredProvider(): string | null {
  try {
    return localStorage.getItem(PROVIDER_STORAGE_KEY);
  } catch {
    return null;
  }
}
function getStoredModel(): string | null {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}
function storeProvider(v: string) {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}
function storeModel(v: string) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}

export function PlaygroundPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { providers, fetchProviders } = useProviders();
  const {
    loading,
    streaming,
    responseText,
    reasoningText,
    metrics,
    error,
    runPrompt,
    streamPrompt,
    abort,
    reset,
    restore,
  } = usePlayground();
  const {
    items: historyItems,
    loading: historyLoading,
    fetchHistory,
    getDetail,
    deleteEntry,
    clearAll,
  } = usePlaygroundHistory();

  // Build model ID → displayName lookup from loaded providers
  const modelDisplayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of providers) {
      for (const m of p.models ?? []) {
        if (m.displayName) map[m.name] = m.displayName;
      }
    }
    return map;
  }, [providers]);

  // Enrich history items with display names
  const enrichedHistoryItems = useMemo(
    () =>
      historyItems.map((it) => {
        // Look up by full model name first (e.g. "z-ai/glm-4.7"), then by stripped name
        const display =
          modelDisplayNames[it.modelName] ||
          modelDisplayNames[it.modelName.includes('/') ? it.modelName.split('/').pop()! : it.modelName] ||
          it.modelName;
        return display !== it.modelName ? { ...it, modelName: display } : it;
      }),
    [historyItems, modelDisplayNames],
  );

  const [providerId, setProviderIdRaw] = useState<string | null>(
    () => searchParams.get('provider') || getStoredProvider(),
  );
  const [modelName, setModelNameRaw] = useState<string | null>(() => searchParams.get('model') || getStoredModel());

  const setProviderId = useCallback(
    (v: string | null) => {
      setProviderIdRaw(v);
      if (v) {
        storeProvider(v);
        setSearchParams(
          (prev) => {
            prev.set('provider', v);
            return prev;
          },
          { replace: true },
        );
      } else {
        setSearchParams(
          (prev) => {
            prev.delete('provider');
            return prev;
          },
          { replace: true },
        );
      }
    },
    [setSearchParams],
  );

  const setModelName = useCallback(
    (v: string | null) => {
      setModelNameRaw(v);
      if (v) {
        storeModel(v);
        setSearchParams(
          (prev) => {
            prev.set('model', v);
            return prev;
          },
          { replace: true },
        );
      } else {
        setSearchParams(
          (prev) => {
            prev.delete('model');
            return prev;
          },
          { replace: true },
        );
      }
    },
    [setSearchParams],
  );
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxTokens, setMaxTokensRaw] = useState(getStoredMaxTokens);
  const setMaxTokens = (v: number) => {
    setMaxTokensRaw(v);
    storeMaxTokens(v);
  };
  const [useStreaming, setUseStreaming] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showLongContext, setShowLongContext] = useState(true);
  const [isMultiDoc, setIsMultiDoc] = useState(false);
  const [outputScope, setOutputScope] = useState(getStoredOutputScope);
  const [activePreset, setActivePreset] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevLoadingRef = useRef(false);
  // For very large prompts, store the full text in a ref to avoid textarea lag.
  // prompt state holds a truncated preview; fullPromptRef holds the real content.
  const HEAVY_THRESHOLD = 10_000; // chars
  const fullPromptRef = useRef<string | null>(null);
  const [isHeavyPrompt, setIsHeavyPrompt] = useState(false);
  // eslint-disable-next-line react-hooks/refs
  const effectivePrompt = fullPromptRef.current ?? prompt;
  const promptTokenCount = useTokenCount(isHeavyPrompt ? '' : prompt);

  useEffect(() => {
    fetchProviders();
    fetchHistory();
  }, [fetchProviders, fetchHistory]);

  // Auto-refresh history after a run completes
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      fetchHistory();
    }
    prevLoadingRef.current = loading;
  }, [loading, fetchHistory]);

  const selectedProvider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);

  const activeModels = useMemo(
    () => (selectedProvider?.models || []).filter((m) => m.isActive !== false),
    [selectedProvider],
  );

  useEffect(() => {
    if (activeModels.length > 0 && !activeModels.find((m) => m.name === modelName)) {
      setModelName(activeModels[0].name);
    }
  }, [activeModels, modelName, setModelName]);

  const selectedModel = useMemo(() => activeModels.find((m) => m.name === modelName), [activeModels, modelName]);
  const supportsVision = selectedModel?.supportsVision ?? false;

  // Clear uploaded images when switching to a non-vision model
  useEffect(() => {
    if (!supportsVision && images.length > 0) {
      setImages([]);
    }
  }, [supportsVision]); // eslint-disable-line react-hooks/exhaustive-deps

  const canRun = providerId && modelName && prompt.trim();

  const setPromptSmart = (text: string) => {
    if (text.length > HEAVY_THRESHOLD) {
      fullPromptRef.current = text;
      setIsHeavyPrompt(true);
      setPrompt(text.slice(0, 200) + `\n\n… [${text.length.toLocaleString()} chars total — full text loaded]`);
    } else {
      fullPromptRef.current = null;
      setIsHeavyPrompt(false);
      setPrompt(text);
    }
  };

  const handleRun = () => {
    if (!canRun) return;
    setHasRun(true);
    const params = {
      providerId: providerId!,
      modelName: modelName!,
      prompt: effectivePrompt.trim(),
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

  const addImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 10 * 1024 * 1024) return; // 10MB limit
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setImages((prev) => [
          ...prev,
          {
            type: 'base64',
            mediaType: file.type,
            data: base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addImageFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addImageFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopyResponse = async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  };

  const handleSelectHistory = async (id: string) => {
    const detail = await getDetail(id);
    if (!detail) return;
    setSelectedHistoryId(id);
    const providerExists = providers.some((p) => p.id === detail.providerId);
    if (providerExists) {
      setProviderId(detail.providerId);
      setModelName(detail.modelName);
    } else {
      setProviderId(null);
      setModelName(null);
    }
    setPromptSmart(detail.prompt);
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
              onClick={() => setHistoryOpen((v) => !v)}
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
                value={providers.length > 0 ? providerId : undefined}
                onChange={(val) => {
                  setProviderId(val);
                  setModelName(null);
                }}
                options={providers.map((p) => ({
                  value: p.id,
                  label: (
                    <span className="flex items-center gap-2">
                      <span>{p.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/8 text-text-tertiary font-mono">
                        {p.format}
                      </span>
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
                value={activeModels.length > 0 ? modelName : undefined}
                onChange={setModelName}
                options={activeModels.map((m) => ({
                  value: m.name,
                  label: (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px]">{m.displayName || m.name}</span>
                      <span className="text-[11px] text-text-tertiary">{Math.round(m.contextSize / 1000)}K</span>
                      {m.supportsVision && (
                        <span className="text-[10px] px-1 rounded bg-accent-teal/15 text-accent-teal">V</span>
                      )}
                      {m.supportsTools && (
                        <span className="text-[10px] px-1 rounded bg-accent-blue/15 text-accent-blue">T</span>
                      )}
                    </span>
                  ),
                }))}
              />
            </div>
          </div>

          {/* System Prompt */}
          <Collapse
            ghost
            items={[
              {
                key: 'system',
                label: <span className="text-[12px] text-text-secondary">System Prompt</span>,
                children: (
                  <TextArea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Optional system instructions..."
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    className="font-mono text-[13px]"
                  />
                ),
              },
            ]}
          />

          {/* Config Row — above prompt, set once use many */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-text-tertiary">Max Tokens</label>
              <InputNumber
                changeOnBlur
                min={1}
                max={128000}
                value={maxTokens}
                onChange={(v) => v && setMaxTokens(v)}
                size="small"
                className="w-24"
              />
              <div className="flex gap-1">
                {QUICK_MAX_TOKENS.map((q) => (
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

          {/* Prompt with inline image support, presets, and Run button */}
          <div>
            <label className="block text-[12px] text-text-tertiary mb-1.5 uppercase tracking-wider">Prompt</label>
            <div
              className={`relative rounded-lg border transition-colors ${
                isDragging ? 'border-accent-blue border-dashed bg-accent-blue/5' : 'border-border'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
            >
              {/* Image Previews — above textarea */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 pb-0">
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className="relative group rounded border border-border overflow-hidden"
                      style={{ width: 64, height: 64 }}
                    >
                      <img
                        src={`data:${img.mediaType};base64,${img.data}`}
                        alt={`Image ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <DeleteOutlined style={{ fontSize: 9 }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Drag overlay */}
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-accent-blue/5 rounded-lg z-10 pointer-events-none">
                  <span className="text-[13px] text-accent-blue">Drop images here</span>
                </div>
              )}

              <TextArea
                value={prompt}
                onChange={(e) => {
                  fullPromptRef.current = null;
                  setIsHeavyPrompt(false);
                  setPrompt(e.target.value);
                  setActivePreset(undefined);
                }}
                placeholder="Enter your prompt... (paste or drop images here)"
                autoSize={{ minRows: 4, maxRows: 12 }}
                className="font-mono text-[13px] !border-0 !shadow-none !bg-transparent"
                readOnly={isHeavyPrompt}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canRun && !loading) {
                    handleRun();
                  }
                }}
                onPaste={handlePaste}
              />
              {isHeavyPrompt && (
                <div className="mx-2 mb-1 px-2 py-1 rounded bg-surface-secondary border border-border flex items-center justify-between gap-2">
                  <span className="text-[11px] text-text-tertiary">Large prompt loaded — editing disabled</span>
                  <button
                    onClick={() => {
                      fullPromptRef.current = null;
                      setIsHeavyPrompt(false);
                      setPrompt('');
                    }}
                    className="text-[11px] text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
              {(prompt || isHeavyPrompt) && (
                <div className="px-2 pb-1">
                  <span className="text-[10px] text-text-tertiary font-mono">
                    {isHeavyPrompt
                      ? `~${(effectivePrompt.length / 4).toFixed(0)} tokens`
                      : `${promptTokenCount} tokens`}
                  </span>
                </div>
              )}

              {/* Bottom bar — image, presets, run */}
              <div className="flex items-center gap-2 px-2 pb-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Tooltip
                  title={
                    supportsVision
                      ? 'Add images (or paste / drag-and-drop)'
                      : 'This model does not support vision / image input'
                  }
                >
                  <button
                    onClick={() => supportsVision && fileInputRef.current?.click()}
                    disabled={!supportsVision}
                    className={`flex items-center gap-1 text-[12px] px-2 py-1 rounded transition-colors ${
                      !supportsVision
                        ? 'text-text-tertiary/40 cursor-not-allowed'
                        : images.length > 0
                          ? 'text-accent-teal bg-accent-teal/10'
                          : 'text-text-tertiary hover:text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    <PictureOutlined />
                    {images.length > 0 && <span className="font-mono">{images.length}</span>}
                  </button>
                </Tooltip>

                {/* Presets — inline in bottom bar */}
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {STANDARD_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setIsMultiDoc(false);
                        setActivePreset(preset.label);
                        setPromptSmart(preset.prompt);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                        activePreset === preset.label
                          ? 'border-accent-blue/40 bg-accent-blue/8 text-accent-blue'
                          : 'border-border text-text-tertiary hover:text-text-secondary hover:border-accent-blue/40'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  {!showLongContext ? (
                    <button
                      onClick={() => setShowLongContext(true)}
                      className="text-[10px] px-2 py-0.5 rounded border border-border text-text-tertiary hover:text-text-secondary transition-colors whitespace-nowrap"
                    >
                      Long Context...
                    </button>
                  ) : (
                    SHAREGPT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={async () => {
                          const md = !!preset.multiDoc;
                          setIsMultiDoc(md);
                          setActivePreset(preset.label);
                          let raw: string;
                          if (preset.heavy) {
                            const bucket =
                              preset.tokens >= 200_000 ? '256k' : preset.tokens >= 100_000 ? '150k' : '64k';
                            raw = await loadHeavyPreset(bucket);
                          } else {
                            raw = preset.prompt;
                          }
                          setPromptSmart(md ? applyOutputScope(raw, outputScope) : raw);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                          activePreset === preset.label
                            ? 'border-accent-blue/40 bg-accent-blue/8 text-accent-blue'
                            : 'border-border text-text-tertiary hover:text-text-secondary hover:border-accent-blue/40'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))
                  )}
                </div>

                {/* Output Scope (multi-doc presets only) */}
                {isMultiDoc && (
                  <Tooltip title="Controls how many documents the model should read and summarize. Fewer docs = shorter output (~500 tokens for 3 docs). Use this to limit output length while keeping the full prompt as input.">
                    <Select
                      size="small"
                      value={outputScope}
                      onChange={(v) => {
                        setOutputScope(v);
                        storeOutputScope(v);
                        const fullText = fullPromptRef.current || prompt;
                        setPromptSmart(applyOutputScope(fullText, v));
                      }}
                      options={OUTPUT_SCOPE_OPTIONS}
                      style={{ width: 140, fontSize: 10 }}
                    />
                  </Tooltip>
                )}

                {/* Run / Stop — right side */}
                {loading ? (
                  <button
                    onClick={abort}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-rose/15 text-accent-rose hover:bg-accent-rose/25 transition-colors text-[12px] font-medium whitespace-nowrap"
                  >
                    <StopOutlined />
                    Stop
                  </button>
                ) : (
                  <Tooltip title={canRun ? 'Cmd+Enter' : 'Select provider, model, and enter a prompt'}>
                    <button
                      onClick={handleRun}
                      disabled={!canRun}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
                        canRun
                          ? 'bg-accent-blue text-white hover:bg-accent-blue/90'
                          : 'bg-white/5 text-text-tertiary cursor-not-allowed'
                      }`}
                    >
                      <SendOutlined />
                      Run
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <Alert type="error" message={error} closable onClose={() => reset()} showIcon />}

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
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded font-mono ml-auto"
                    style={{
                      backgroundColor: `${getProviderColor(providerId || '')}0a`,
                      color: getProviderColor(providerId || ''),
                      border: `1px solid ${getProviderColor(providerId || '')}20`,
                    }}
                  >
                    {selectedProvider.name} / {modelName}
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
                items={[
                  {
                    key: 'debug',
                    label: <span className="text-[12px] text-text-secondary">Debug Details</span>,
                    children: (
                      <pre className="whitespace-pre-wrap text-[11px] font-mono text-text-secondary bg-[#0a0a0a] p-3 rounded overflow-auto max-h-[300px] m-0">
                        {JSON.stringify(
                          {
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
                          },
                          null,
                          2,
                        )}
                      </pre>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}
      </div>

      {/* History Sidebar */}
      {historyOpen && (
        <PlaygroundHistorySidebar
          items={enrichedHistoryItems}
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
  const colorMap: Record<string, string> = {
    'text-accent-blue': '#4096ff',
    'text-accent-amber': '#ff9830',
    'text-accent-teal': '#73bf69',
    'text-accent-rose': '#f2495c',
    'text-accent-violet': '#8a6dff',
    'text-text-primary': 'rgba(255,255,255,0.88)',
  };

  const cards = [
    {
      label: 'Response Time',
      tooltip: 'Total time from request sent to response fully received',
      value: metrics?.responseTime != null ? `${metrics.responseTime.toLocaleString()} ms` : '--',
      icon: <ClockCircleOutlined />,
      cls: 'text-accent-blue',
    },
    {
      label: 'First Token',
      tooltip: 'Time To First Token (TTFT) — how long until the first token arrives',
      value:
        metrics?.firstTokenLatency != null && metrics.firstTokenLatency > 0
          ? `${metrics.firstTokenLatency.toLocaleString()} ms`
          : metrics
            ? 'N/A'
            : '--',
      icon: <ThunderboltOutlined />,
      cls: 'text-accent-amber',
    },
    {
      label: 'TPS',
      tooltip: 'Tokens Per Second — output speed of this request',
      value: metrics?.tokensPerSecond != null ? `${metrics.tokensPerSecond}` : '--',
      icon: <DashboardOutlined />,
      cls: metrics?.tokensPerSecond === 0 && metrics?.outputTokens === 0 ? 'text-accent-rose' : 'text-accent-teal',
      warn: metrics?.tokensPerSecond === 0 && metrics?.outputTokens === 0,
    },
    {
      label: 'Tokens',
      tooltip: 'Input and output token counts for this request',
      value: metrics?.inputTokens != null ? `${metrics.inputTokens} in / ${metrics.outputTokens ?? 0} out` : '--',
      icon: metrics?.outputTokens === 0 ? <WarningOutlined /> : null,
      cls: metrics?.outputTokens === 0 ? 'text-accent-rose' : 'text-accent-violet',
      warn: metrics?.outputTokens === 0,
      sublabel: metrics?.reasoningTokens ? `(${metrics.reasoningTokens} reasoning)` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => {
        const c = colorMap[card.cls] || '#73bf69';
        return (
          <div
            key={card.label}
            className="stat-card"
            style={card.warn ? { borderColor: 'rgba(242,73,92,0.3)', background: 'rgba(242,73,92,0.05)' } : undefined}
          >
            <Tooltip title={card.tooltip}>
              <div className="flex items-center gap-1.5 cursor-help">
                {card.icon && (
                  <span className="text-[12px]" style={{ color: c }}>
                    {card.icon}
                  </span>
                )}
                <span className="stat-label">{card.label}</span>
              </div>
            </Tooltip>
            <div className="stat-value" style={{ color: c, fontSize: 16, minHeight: 22 }}>
              {loading && !metrics ? <span className="animate-pulse">{card.value}</span> : card.value}
            </div>
            {card.sublabel && <div className="text-[11px] text-text-tertiary mt-0.5">{card.sublabel}</div>}
            {card.warn && (
              <div className="text-[11px] text-accent-rose mt-1 flex items-center gap-1">
                <WarningOutlined className="text-[11px]" />
                No token data from API
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

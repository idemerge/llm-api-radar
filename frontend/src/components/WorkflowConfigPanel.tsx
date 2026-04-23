import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  WorkflowTemplate,
  BenchmarkConfig,
  BenchmarkWorkflow,
  ProviderConfigResponse,
  FORMAT_COLORS,
  getProviderColor,
} from '../types';
import {
  PRESET_PROMPTS,
  QUICK_MAX_TOKENS,
  QUICK_CONCURRENCY,
  QUICK_ITERATIONS,
  QUICK_WARMUP,
  QUICK_INTERVAL,
  QUICK_QPS,
  OUTPUT_SCOPE_OPTIONS,
  applyOutputScope,
  getStoredOutputScope,
  storeOutputScope,
  getStoredMaxTokens,
  storeMaxTokens,
} from '../constants';
import { countTokens } from '../utils/tokenCount';
import { loadHeavyPreset } from '../constants';
import { CreateWorkflowData } from '../hooks/useWorkflow';
import { useProviders } from '../hooks/useProviders';
import { Button, Input, InputNumber, Switch, Collapse, Tooltip, Select } from '../antdImports';
import {
  PlusOutlined,
  UpOutlined,
  DownOutlined,
  CloseOutlined,
  CopyOutlined,
  LoadingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

interface TaskConfig {
  name: string;
  description: string;
  config: BenchmarkConfig;
  providers?: string[];
  tags: Record<string, string>;
  _outputScope?: number; // UI-only: long-context output scope (0=all, N=first N docs)
  _isLongContext?: boolean; // UI-only: whether a long-context preset is active
}

interface WorkflowConfigPanelProps {
  onStart: (data: CreateWorkflowData) => void;
  isRunning: boolean;
  templates: WorkflowTemplate[];
  onCancel?: () => void;
  initialWorkflow?: BenchmarkWorkflow | null;
  onInitialWorkflowConsumed?: () => void;
}

const DEFAULT_TASK: () => TaskConfig = () => ({
  name: 'Task 1',
  description: '',
  config: {
    prompt: 'Explain quantum computing in simple terms.',
    systemPrompt: '',
    maxTokens: getStoredMaxTokens(),
    concurrency: 1,
    iterations: 10,
    streaming: true,
    warmupRuns: 0,
    requestInterval: 0,
    randomizeInterval: false,
    maxQps: 0,
  },
  tags: {},
});

interface SelectedModel {
  providerId: string;
  modelName: string;
  providerName: string;
  displayLabel: string;
  color: string;
}

export function WorkflowConfigPanel({
  onStart,
  isRunning,
  templates,
  onCancel,
  initialWorkflow,
  onInitialWorkflowConsumed,
}: WorkflowConfigPanelProps) {
  const { providers: configuredProviders, loading: providersLoading, fetchProviders } = useProviders();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedModels, setSelectedModels] = useState<SelectedModel[]>([]);
  const [tasks, setTasks] = useState<TaskConfig[]>([DEFAULT_TASK()]);
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [cooldown, setCooldown] = useState(3000);
  const [expandedTask, setExpandedTask] = useState<number>(0);
  const HEAVY_THRESHOLD = 10_000; // chars
  const heavyPromptsRef = useRef<Map<number, string>>(new Map());
  const [heavyTaskIndexes, setHeavyTaskIndexes] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Load initial workflow data when provided
  useEffect(() => {
    if (!initialWorkflow || !configuredProviders.length) return;

    setName(initialWorkflow.name ? `${initialWorkflow.name} (copy)` : '');
    setDescription(initialWorkflow.description || '');
    setStopOnFailure(initialWorkflow.options?.stopOnFailure ?? true);
    setCooldown(initialWorkflow.options?.cooldownBetweenTasks ?? 3000);

    // Restore selected models from providers list
    const models: SelectedModel[] = [];
    for (const p of initialWorkflow.providers) {
      if (!p.includes(':')) continue;
      const [configId, modelName] = p.split(':', 2);
      const provider = configuredProviders.find((cp) => cp.id === configId);
      if (provider) {
        const color = FORMAT_COLORS[provider.format] || '#999';
        models.push({
          providerId: configId,
          modelName,
          providerName: provider.name,
          displayLabel: `${provider.name} / ${modelName}`,
          color,
        });
      }
    }
    setSelectedModels(models);

    // Restore tasks
    if (initialWorkflow.tasks?.length) {
      setTasks(
        initialWorkflow.tasks.map((t) => ({
          name: t.name,
          description: t.description || '',
          config: {
            prompt: t.config.prompt,
            systemPrompt: t.config.systemPrompt || '',
            maxTokens: t.config.maxTokens || getStoredMaxTokens(),
            concurrency: t.config.concurrency || 1,
            iterations: t.config.iterations || 10,
            streaming: t.config.streaming ?? true,
            warmupRuns: t.config.warmupRuns ?? 0,
            requestInterval: t.config.requestInterval ?? 0,
            randomizeInterval: t.config.randomizeInterval ?? false,
            maxQps: t.config.maxQps ?? 0,
            targetCacheHitRate: t.config.targetCacheHitRate,
          },
          providers: t.providers,
          tags: t.tags || {},
        })),
      );
      setExpandedTask(0);
    }

    onInitialWorkflowConsumed?.();
  }, [initialWorkflow, configuredProviders]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleModel = (provider: ProviderConfigResponse, modelName: string) => {
    const key = `${provider.id}:${modelName}`;
    setSelectedModels((prev) => {
      const exists = prev.find((m) => `${m.providerId}:${m.modelName}` === key);
      if (exists) {
        return prev.filter((m) => `${m.providerId}:${m.modelName}` !== key);
      }
      return [
        ...prev,
        {
          providerId: provider.id,
          modelName,
          providerName: provider.name,
          displayLabel: `${provider.name} / ${modelName}`,
          color: FORMAT_COLORS[provider.format] || '#999',
        },
      ];
    });
  };

  const isModelSelected = (providerId: string, modelName: string) =>
    selectedModels.some((m) => m.providerId === providerId && m.modelName === modelName);

  const addTask = () => {
    const newTask = DEFAULT_TASK();
    newTask.name = `Task ${tasks.length + 1}`;
    setTasks([...tasks, newTask]);
    setExpandedTask(tasks.length);
  };

  const removeTask = (index: number) => {
    if (tasks.length <= 1) return;
    const newTasks = tasks.filter((_, i) => i !== index);
    setTasks(newTasks);
    if (expandedTask >= newTasks.length) {
      setExpandedTask(newTasks.length - 1);
    }

    // Re-index heavy prompt entries after removal
    const newHeavy = new Map<number, string>();
    for (const [k, v] of heavyPromptsRef.current) {
      if (k === index) continue;
      newHeavy.set(k > index ? k - 1 : k, v);
    }
    heavyPromptsRef.current = newHeavy;

    setHeavyTaskIndexes((prev) => {
      const shifted = new Set<number>();
      for (const k of prev) {
        if (k === index) continue;
        shifted.add(k > index ? k - 1 : k);
      }
      return shifted;
    });
  };

  const duplicateTask = (index: number) => {
    const source = tasks[index];
    const cloned: TaskConfig = {
      ...source,
      name: `${source.name} (copy)`,
      config: { ...source.config },
      tags: { ...source.tags },
      providers: source.providers ? [...source.providers] : undefined,
    };
    const newTasks = [...tasks];
    newTasks.splice(index + 1, 0, cloned);
    setTasks(newTasks);

    // Shift heavy prompt entries for indexes after the insertion point
    const newHeavy = new Map<number, string>();
    for (const [k, v] of heavyPromptsRef.current) {
      newHeavy.set(k > index ? k + 1 : k, v);
    }
    // Copy heavy prompt for the duplicated task
    const sourceHeavy = heavyPromptsRef.current.get(index);
    if (sourceHeavy) {
      newHeavy.set(index + 1, sourceHeavy);
    }
    heavyPromptsRef.current = newHeavy;

    setHeavyTaskIndexes((prev) => {
      const shifted = new Set<number>();
      for (const k of prev) {
        shifted.add(k > index ? k + 1 : k);
      }
      if (prev.has(index)) {
        shifted.add(index + 1);
      }
      return shifted;
    });

    setExpandedTask(index + 1);
  };

  const moveTask = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tasks.length) return;
    const newTasks = [...tasks];
    [newTasks[index], newTasks[newIndex]] = [newTasks[newIndex], newTasks[index]];
    setTasks(newTasks);

    // Swap heavy prompt entries for the two indexes
    const aHeavy = heavyPromptsRef.current.get(index);
    const bHeavy = heavyPromptsRef.current.get(newIndex);
    heavyPromptsRef.current.delete(index);
    heavyPromptsRef.current.delete(newIndex);
    if (aHeavy) heavyPromptsRef.current.set(newIndex, aHeavy);
    if (bHeavy) heavyPromptsRef.current.set(index, bHeavy);

    setHeavyTaskIndexes((prev) => {
      const hasA = prev.has(index);
      const hasB = prev.has(newIndex);
      if (hasA === hasB) return prev;
      const next = new Set(prev);
      next.delete(index);
      next.delete(newIndex);
      if (hasA) next.add(newIndex);
      if (hasB) next.add(index);
      return next;
    });

    setExpandedTask(newIndex);
  };

  const updateTask = (index: number, updates: Partial<TaskConfig>) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    setTasks(newTasks);
  };

  const updateTaskConfig = (index: number, configUpdates: Partial<BenchmarkConfig>) => {
    const newTasks = [...tasks];
    newTasks[index] = {
      ...newTasks[index],
      config: { ...newTasks[index].config, ...configUpdates },
    };
    setTasks(newTasks);
  };

  const setTaskPromptSmart = (index: number, text: string) => {
    if (text.length > HEAVY_THRESHOLD) {
      heavyPromptsRef.current.set(index, text);
      setHeavyTaskIndexes((prev) => new Set(prev).add(index));
      updateTaskConfig(index, {
        prompt: text.slice(0, 200) + `\n\n… [${text.length.toLocaleString()} chars total — full text loaded]`,
      });
    } else {
      heavyPromptsRef.current.delete(index);
      setHeavyTaskIndexes((prev) => {
        const s = new Set(prev);
        s.delete(index);
        return s;
      });
      updateTaskConfig(index, { prompt: text });
    }
  };

  const loadTemplate = (template: WorkflowTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setStopOnFailure(template.options.stopOnFailure);
    setCooldown(template.options.cooldownBetweenTasks);
    setTasks(
      template.tasks.map((t) => ({
        name: t.name,
        description: t.description || '',
        config: {
          prompt: t.config.prompt,
          systemPrompt: t.config.systemPrompt || '',
          maxTokens: t.config.maxTokens || 500,
          concurrency: t.config.concurrency || 1,
          iterations: t.config.iterations || 10,
          streaming: t.config.streaming ?? true,
          warmupRuns: t.config.warmupRuns ?? 0,
          requestInterval: t.config.requestInterval ?? 0,
          randomizeInterval: t.config.randomizeInterval ?? false,
          maxQps: t.config.maxQps ?? 0,
          images: t.config.images,
          targetCacheHitRate: t.config.targetCacheHitRate,
        },
        tags: t.tags || {},
      })),
    );
    setExpandedTask(0);
  };

  const handleStart = () => {
    if (!name || selectedModels.length === 0 || tasks.length === 0) return;
    const providerKeys = selectedModels.map((m) => `${m.providerId}:${m.modelName}`);
    onStart({
      name,
      description: description || undefined,
      providers: providerKeys,
      apiKeys: {},
      tasks: tasks.map((t, i) => ({
        name: t.name,
        description: t.description || undefined,
        config: {
          ...t.config,
          prompt: heavyPromptsRef.current.get(i) ?? t.config.prompt,
        },
        tags: Object.keys(t.tags).length > 0 ? t.tags : undefined,
      })),
      options: { stopOnFailure, cooldownBetweenTasks: cooldown },
    });
  };

  const QuickButtons = ({
    options,
    value,
    onChange,
    color = '#73bf69',
  }: {
    options: { label: string; value: number }[];
    value: number;
    onChange: (v: number) => void;
    color?: string;
  }) => (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-[10px] px-2 py-1 rounded border transition-all font-medium font-mono ${
            value === opt.value ? '' : 'border-border text-text-tertiary hover:border-border-hover'
          }`}
          style={{
            ...(value === opt.value
              ? {
                  borderColor: `${color}66`,
                  backgroundColor: `${color}14`,
                  color,
                }
              : {}),
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const collapseItems = tasks.map((task, index) => {
    return {
      key: String(index),
      label: (
        <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-text-tertiary w-6 font-medium">{index + 1}.</span>
          <span className="text-sm text-text-primary flex-1 truncate">{task.name}</span>
          <span className="text-[11px] text-text-secondary font-mono">
            {task.config.concurrency}c × {task.config.iterations}i · {task.config.maxTokens}t
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                moveTask(index, -1);
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              disabled={index === tasks.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                moveTask(index, 1);
              }}
            />
            <Tooltip title="Duplicate task">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateTask(index);
                }}
              />
            </Tooltip>
            <Button
              type="text"
              size="small"
              danger
              icon={<CloseOutlined />}
              disabled={tasks.length <= 1}
              onClick={(e) => {
                e.stopPropagation();
                removeTask(index);
              }}
            />
          </div>
        </div>
      ),
      children: (
        <div className="space-y-5">
          {/* Row 1: Task name */}
          <div className="flex items-center gap-3">
            <Input
              value={task.name}
              onChange={(e) => updateTask(index, { name: e.target.value })}
              placeholder="Task name"
              style={{ flex: 1 }}
            />
          </div>

          {/* Row 2: Preset Prompt Buttons */}
          <div className="space-y-2">
            <label className="text-[11px] text-text-secondary font-medium">Preset Prompts</label>
            <Tooltip title="Click a preset to fill the prompt field with a pre-configured test prompt">
              <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help ml-1" />
            </Tooltip>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_PROMPTS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={async () => {
                    const isLC = !!preset.multiDoc;
                    const scope = task._outputScope ?? getStoredOutputScope();
                    let raw: string;
                    if (preset.heavy) {
                      const bucket = preset.tokens >= 200_000 ? '256k' : preset.tokens >= 100_000 ? '150k' : '64k';
                      raw = await loadHeavyPreset(bucket);
                    } else {
                      raw = preset.prompt;
                    }
                    const finalText = isLC ? applyOutputScope(raw, scope) : raw;
                    const newTasks = [...tasks];
                    const updated = { ...newTasks[index], _isLongContext: isLC, _outputScope: scope };
                    if (finalText.length > HEAVY_THRESHOLD) {
                      heavyPromptsRef.current.set(index, finalText);
                      setHeavyTaskIndexes((prev) => new Set(prev).add(index));
                      updated.config = {
                        ...updated.config,
                        prompt:
                          finalText.slice(0, 200) +
                          `\n\n… [${finalText.length.toLocaleString()} chars total — full text loaded]`,
                      };
                    } else {
                      heavyPromptsRef.current.delete(index);
                      setHeavyTaskIndexes((prev) => {
                        const s = new Set(prev);
                        s.delete(index);
                        return s;
                      });
                      updated.config = { ...updated.config, prompt: finalText };
                    }
                    newTasks[index] = updated;
                    setTasks(newTasks);
                  }}
                  className={`text-[10px] px-2 py-1 rounded border transition-all font-medium ${
                    task.config.prompt === preset.prompt
                      ? 'border-accent-teal/40 bg-accent-teal/8 text-accent-teal'
                      : 'border-border text-text-secondary hover:border-border-hover hover:text-text-primary'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Output Scope (long-context only) */}
          {task._isLongContext && (
            <div className="flex items-center gap-2">
              <Tooltip title="Controls how many documents the model should read and summarize. Fewer docs = shorter output (~500 tokens for 3 docs). Use this to limit output length while keeping the full prompt as input.">
                <label className="text-[11px] text-text-secondary font-medium whitespace-nowrap cursor-help">
                  Output Scope
                </label>
              </Tooltip>
              <Select
                size="small"
                value={task._outputScope ?? getStoredOutputScope()}
                onChange={(v) => {
                  storeOutputScope(v);
                  const newTasks = [...tasks];
                  newTasks[index] = { ...newTasks[index], _outputScope: v };
                  setTasks(newTasks);
                  const fullPrompt = heavyPromptsRef.current.get(index) || task.config.prompt;
                  setTaskPromptSmart(index, applyOutputScope(fullPrompt, v));
                }}
                options={OUTPUT_SCOPE_OPTIONS}
                style={{ width: 160, fontSize: 11 }}
              />
            </div>
          )}

          {/* Row 3: Prompt TextArea + System Prompt */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-[11px] text-text-secondary font-medium">Test Prompt</label>
              <Tooltip title="The prompt sent to each provider for benchmarking. Use a consistent prompt for fair comparison.">
                <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help ml-1" />
              </Tooltip>
              <Input.TextArea
                value={task.config.prompt}
                onChange={(e) => {
                  heavyPromptsRef.current.delete(index);
                  setHeavyTaskIndexes((prev) => {
                    const s = new Set(prev);
                    s.delete(index);
                    return s;
                  });
                  updateTaskConfig(index, { prompt: e.target.value });
                }}
                readOnly={heavyTaskIndexes.has(index)}
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder="Test prompt — the prompt sent to each provider for benchmarking"
                style={{ fontSize: 13 }}
              />
              {heavyTaskIndexes.has(index) && (
                <div className="px-2 py-1 rounded bg-surface-secondary border border-border flex items-center justify-between gap-2">
                  <span className="text-[11px] text-text-tertiary">Large prompt loaded — editing disabled</span>
                  <button
                    onClick={() => {
                      heavyPromptsRef.current.delete(index);
                      setHeavyTaskIndexes((prev) => {
                        const s = new Set(prev);
                        s.delete(index);
                        return s;
                      });
                      updateTaskConfig(index, { prompt: '' });
                    }}
                    className="text-[11px] text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
              {!heavyTaskIndexes.has(index) && (
                <span className="text-[10px] text-text-tertiary font-mono">
                  {countTokens(task.config.prompt)} tokens
                </span>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[11px] text-text-secondary font-medium">System Prompt (optional)</label>
              <Tooltip title="Optional system prompt to set model behavior context before the test prompt">
                <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help ml-1" />
              </Tooltip>
              <Input.TextArea
                value={task.config.systemPrompt || ''}
                onChange={(e) => updateTaskConfig(index, { systemPrompt: e.target.value })}
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder="Optional system prompt to set behavior context..."
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          {/* Row 4: Core Parameters with QuickButtons */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-text-secondary font-medium">Max Tokens</label>
                <Tooltip title="Maximum number of tokens in the model's response (50–32000)">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <QuickButtons
                options={QUICK_MAX_TOKENS}
                value={task.config.maxTokens}
                onChange={(v) => {
                  updateTaskConfig(index, { maxTokens: v });
                  storeMaxTokens(v);
                }}
                color="#73bf69"
              />
              <InputNumber
                changeOnBlur
                value={task.config.maxTokens}
                onChange={(v) => {
                  const val = v ?? getStoredMaxTokens();
                  updateTaskConfig(index, { maxTokens: val });
                  storeMaxTokens(val);
                }}
                min={50}
                max={32000}
                size="small"
                className="font-mono"
                style={{ width: '100%' }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-text-secondary font-medium">Concurrency</label>
                <Tooltip title="Number of parallel requests per iteration (1–200). Higher = more load.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <QuickButtons
                options={QUICK_CONCURRENCY}
                value={task.config.concurrency}
                onChange={(v) => updateTaskConfig(index, { concurrency: v })}
                color="#4096ff"
              />
              <InputNumber
                changeOnBlur
                value={task.config.concurrency}
                onChange={(v) => updateTaskConfig(index, { concurrency: v ?? 1 })}
                min={1}
                max={200}
                size="small"
                className="font-mono"
                style={{ width: '100%' }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-text-secondary font-medium">Iterations</label>
                <Tooltip title="Number of times to repeat the benchmark (1–2000). More iterations = more reliable averages.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <QuickButtons
                options={QUICK_ITERATIONS}
                value={task.config.iterations}
                onChange={(v) => updateTaskConfig(index, { iterations: v })}
                color="#73bf69"
              />
              <InputNumber
                changeOnBlur
                value={task.config.iterations}
                onChange={(v) => updateTaskConfig(index, { iterations: v ?? 10 })}
                min={1}
                max={2000}
                size="small"
                className="font-mono"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Advanced Parameters */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-text-secondary font-medium">Warmup Runs</label>
                <Tooltip title="Number of warmup requests before measuring (0–5). Discarded from results.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <QuickButtons
                options={QUICK_WARMUP}
                value={task.config.warmupRuns ?? 0}
                onChange={(v) => updateTaskConfig(index, { warmupRuns: v })}
                color="#ff9830"
              />
              <InputNumber
                changeOnBlur
                value={task.config.warmupRuns ?? 0}
                onChange={(v) => updateTaskConfig(index, { warmupRuns: v ?? 0 })}
                min={0}
                max={5}
                size="small"
                className="font-mono"
                style={{ width: '100%' }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-text-secondary font-medium">Request Interval (ms)</label>
                <Tooltip title="Delay between consecutive requests in ms (0–10000). Helps avoid rate limiting.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <QuickButtons
                options={QUICK_INTERVAL}
                value={task.config.requestInterval ?? 0}
                onChange={(v) => updateTaskConfig(index, { requestInterval: v })}
                color="#ff9830"
              />
              <InputNumber
                changeOnBlur
                value={task.config.requestInterval ?? 0}
                onChange={(v) => updateTaskConfig(index, { requestInterval: v ?? 0 })}
                min={0}
                max={10000}
                size="small"
                className="font-mono"
                style={{ width: '100%' }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-text-secondary font-medium">Max QPS</label>
                <Tooltip title="Global token bucket: max requests per second across all concurrent slots. 0 = unlimited.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <QuickButtons
                options={QUICK_QPS}
                value={task.config.maxQps ?? 0}
                onChange={(v) => updateTaskConfig(index, { maxQps: v })}
                color="#a78bfa"
              />
              <InputNumber
                changeOnBlur
                value={task.config.maxQps ?? 0}
                onChange={(v) => updateTaskConfig(index, { maxQps: v ?? 0 })}
                min={0}
                max={1000}
                step={0.1}
                size="small"
                className="font-mono"
                style={{ width: '100%' }}
                placeholder="0 = unlimited"
              />
            </div>
          </div>

          {/* Streaming + Cache Hit Rate + Custom Providers dropdown — one row */}
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-text-secondary font-medium">Streaming</span>
                <Tooltip title="Use streaming API for real-time token delivery. Recommended for accuracy.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <Switch
                checked={task.config.streaming}
                onChange={(v) => updateTaskConfig(index, { streaming: v })}
                size="small"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={task.config.targetCacheHitRate !== undefined}
                onChange={(v) => updateTaskConfig(index, { targetCacheHitRate: v ? 0.8 : undefined })}
                size="small"
              />
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-text-secondary font-medium">Cache Hit Rate</span>
                <Tooltip title="Prepends a unique UUID to each request to control prefix-cache hit rate. K = iterations × (1 − rate) unique variants are generated and cycled round-robin.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              {task.config.targetCacheHitRate !== undefined && (
                <InputNumber
                  changeOnBlur
                  value={Math.round(task.config.targetCacheHitRate * 100)}
                  onChange={(v) => updateTaskConfig(index, { targetCacheHitRate: (v ?? 80) / 100 })}
                  min={0}
                  max={99}
                  size="small"
                  className="font-mono"
                  style={{ width: 90 }}
                  addonAfter="%"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Tooltip title="Override global provider selection for this task. Leave empty to use global providers selected above.">
                <span className="text-[11px] text-text-secondary font-medium whitespace-nowrap cursor-help">
                  Custom Providers
                </span>
              </Tooltip>
              <Select
                mode="multiple"
                size="small"
                value={task.providers ?? []}
                onChange={(keys: string[]) => {
                  updateTask(index, { providers: keys.length > 0 ? keys : undefined });
                }}
                placeholder="Using Global Providers"
                allowClear
                showSearch
                style={{ minWidth: 200, maxWidth: 360, fontSize: 11 }}
                popupStyle={{ fontSize: 11 }}
                options={configuredProviders.flatMap((p) => {
                  const color = FORMAT_COLORS[p.format] || '#999';
                  return p.models
                    .filter((m) => m.isActive !== false)
                    .map((m) => ({
                      label: (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: color,
                              display: 'inline-block',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontWeight: 500 }}>{p.name}</span>
                          <span style={{ color: '#888' }}>/ {m.displayName || m.name}</span>
                        </span>
                      ),
                      value: `${p.id}:${m.name}`,
                    }));
                })}
                optionFilterProp="label"
                maxTagCount={2}
                maxTagPlaceholder={(omitted) => `+${omitted.length}`}
                tagRender={(props) => {
                  const { label, closable, onClose } = props;
                  const val = props.value as string;
                  const provider = configuredProviders.find((p) => val.startsWith(p.id + ':'));
                  const color = provider ? FORMAT_COLORS[provider.format] || '#999' : '#999';
                  return (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        padding: '0 4px',
                        margin: '1px 2px',
                        borderRadius: 3,
                        fontSize: 10,
                        backgroundColor: `${color}14`,
                        border: `1px solid ${color}30`,
                        color,
                      }}
                    >
                      {typeof label === 'string' ? label : val.split(':').slice(1).join(':')}
                      {closable && (
                        <span onClick={onClose} style={{ cursor: 'pointer', marginLeft: 2, opacity: 0.6 }}>
                          ✕
                        </span>
                      )}
                    </span>
                  );
                }}
              />
            </div>
          </div>

          {/* Randomize Interval (only when interval > 0) */}
          {(task.config.requestInterval ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-text-secondary font-medium">Randomize Interval</span>
                <Tooltip title="Add random jitter to the request interval (±50%) to simulate realistic traffic">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <Switch
                checked={task.config.randomizeInterval ?? false}
                onChange={(v) => updateTaskConfig(index, { randomizeInterval: v })}
                size="small"
              />
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 space-y-6">
      {/* Top Row: Name, Description, Providers, Settings, Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Basic Info */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-text-primary">Workflow Setup</h2>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name *" />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          {/* Global Settings */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-secondary font-medium">Stop on Failure</span>
                <Tooltip title="Stop the entire workflow when any task fails">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <Switch checked={stopOnFailure} onChange={setStopOnFailure} size="small" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-secondary font-medium">Cooldown</span>
                <Tooltip title="Wait time between tasks (ms). Helps avoid rate limits.">
                  <InfoCircleOutlined className="text-[10px] text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <InputNumber
                changeOnBlur
                value={cooldown}
                onChange={(v) => setCooldown(v ?? 3000)}
                min={0}
                max={30000}
                step={1000}
                size="small"
                style={{ width: 80 }}
                suffix="ms"
              />
            </div>
          </div>

          {/* Selected Models */}
          {selectedModels.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-text-secondary font-medium">
                  Selected Models ({selectedModels.length})
                </span>
                <button
                  className="text-[10px] text-text-tertiary hover:text-accent-rose transition-colors"
                  onClick={() => setSelectedModels([])}
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {selectedModels.map((m) => {
                  const key = `${m.providerId}:${m.modelName}`;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between px-2 py-1 rounded border border-border/50 bg-bg-surface group"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getProviderColor(key) }}
                        />
                        <span className="text-[11px] font-mono truncate" style={{ color: getProviderColor(key) }}>
                          {m.providerName}/{m.modelName}
                        </span>
                      </div>
                      <button
                        className="text-text-tertiary hover:text-accent-rose text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
                        onClick={() => {
                          const provider = configuredProviders.find((p) => p.id === m.providerId);
                          if (provider) toggleModel(provider, m.modelName);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Providers & Models */}
        <div className="space-y-4">
          <label className="section-title">Providers & Models</label>
          {providersLoading && configuredProviders.length === 0 ? (
            <div className="text-center py-4 text-text-tertiary text-[11px] animate-pulse">Loading providers...</div>
          ) : configuredProviders.length === 0 ? (
            <div className="text-center py-4 border border-dashed border-border rounded-md">
              <div className="text-text-tertiary text-[11px]">No providers configured</div>
              <div className="text-text-tertiary text-[10px]">Go to Settings to add providers</div>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {configuredProviders.map((provider) => {
                const activeModels = provider.models.filter((m) => m.isActive !== false);
                const color = FORMAT_COLORS[provider.format] || '#999';
                const hasSelected = activeModels.some((m) => isModelSelected(provider.id, m.name));
                return (
                  <div
                    key={provider.id}
                    className="rounded-md border transition-all"
                    style={{
                      borderColor: hasSelected ? `${color}1a` : 'rgba(255,255,255,0.1)',
                      backgroundColor: hasSelected ? `${color}08` : undefined,
                    }}
                  >
                    <div className="px-3 py-1.5 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[11px] font-medium text-text-primary">{provider.name}</span>
                    </div>
                    <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                      {activeModels.map((model) => {
                        const selected = isModelSelected(provider.id, model.name);
                        return (
                          <button
                            key={model.id}
                            onClick={() => toggleModel(provider, model.name)}
                            className={`text-[10px] px-2 py-1 rounded border transition-all font-medium font-mono ${
                              selected ? '' : 'text-text-tertiary hover:border-border-hover'
                            }`}
                            style={{
                              borderColor: selected ? `${color}1a` : 'rgba(255,255,255,0.1)',
                              backgroundColor: selected ? `${color}0a` : undefined,
                              color: selected ? color : undefined,
                            }}
                          >
                            {model.displayName || model.name}
                            {selected && <span className="ml-1">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {selectedModels.length > 0 && (
            <div className="text-[10px] text-text-tertiary font-mono">
              {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>

        {/* Column 3: Templates */}
        <div className="space-y-4">
          <label className="section-title">Quick Templates</label>
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {templates.map((template) => (
              <button
                key={template.name}
                onClick={() => loadTemplate(template)}
                className="w-full text-left p-3 rounded-md border border-border bg-bg-surface hover:border-accent-violet/30 transition-all group"
              >
                <div className="text-xs font-medium text-accent-violet group-hover:text-accent-violet/90 mb-1">
                  {template.name}
                </div>
                <div className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
                  {template.description}
                </div>
                <div className="text-[10px] text-text-tertiary mt-1 font-mono">{template.tasks.length} tasks</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Task List — full width */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="section-title !mb-0">
            {tasks.length === 1 ? 'Task Configuration' : `Tasks (${tasks.length})`}
          </label>
          {tasks.length > 1 && (
            <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addTask}>
              Add Task
            </Button>
          )}
          {tasks.length === 1 && (
            <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addTask}>
              Add Another Task
            </Button>
          )}
        </div>

        {tasks.length === 1 ? (
          /* Single task: render content directly without Collapse */
          <div className="glass-card p-5 space-y-5">{collapseItems[0]?.children}</div>
        ) : (
          <Collapse
            activeKey={expandedTask >= 0 ? [String(expandedTask)] : []}
            onChange={(keys) => {
              const last = Array.isArray(keys) ? keys[keys.length - 1] : keys;
              setExpandedTask(last !== undefined ? Number(last) : -1);
            }}
            items={collapseItems}
            expandIconPlacement="end"
          />
        )}
      </div>

      {/* Start Button */}
      <div className="flex gap-4">
        <Button
          type="primary"
          onClick={handleStart}
          disabled={isRunning || selectedModels.length === 0 || !name || tasks.length === 0}
          loading={isRunning ? { icon: <LoadingOutlined /> } : false}
          block
          size="large"
        >
          {isRunning ? 'Running...' : `▶ Start Workflow (${tasks.length} tasks, ${selectedModels.length} models)`}
        </Button>

        {isRunning && onCancel && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Button danger size="large" onClick={onCancel} style={{ fontWeight: 500 }}>
              ✕
            </Button>
          </motion.div>
        )}
      </div>

      {!name && <p className="text-xs text-text-tertiary text-center">Enter a workflow name to start</p>}
    </motion.div>
  );
}

import { Router, Request, Response } from 'express';
import { providerStore } from '../services/providerStore';
import { monitorConfigStore } from '../services/monitorConfigStore';
import { testProviderConnection } from '../providers/adapter';
import { ProviderConfigInput, ProviderFormat } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const VALID_FORMATS: ProviderFormat[] = ['openai', 'anthropic', 'gemini', 'custom'];

// GET /api/providers - List all providers (masked keys)
router.get('/', (_req: Request, res: Response) => {
  const providers = providerStore.getAll();
  res.json(providers.map(p => providerStore.toResponse(p)));
});

// POST /api/providers - Create provider
router.post('/', (req: Request, res: Response) => {
  const { name, endpoint, apiKey, format, models } = req.body as ProviderConfigInput;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!endpoint?.trim()) {
    return res.status(400).json({ error: 'Endpoint URL is required' });
  }
  if (!apiKey?.trim()) {
    return res.status(400).json({ error: 'API Key is required' });
  }
  if (!format || !VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: `Format must be one of: ${VALID_FORMATS.join(', ')}` });
  }
  if (!models || !Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ error: 'At least one model is required' });
  }

  for (const model of models) {
    if (!model.name?.trim()) {
      return res.status(400).json({ error: 'Each model must have a name' });
    }
  }

  const input: ProviderConfigInput = {
    name: name.trim(),
    endpoint: endpoint.trim().replace(/\/+$/, ''),
    apiKey: apiKey.trim(),
    format,
    models: models.map(m => ({
      id: m.id || uuidv4(),
      name: m.name.trim(),
      displayName: m.displayName?.trim() || undefined,
      contextSize: m.contextSize || 4096,
      supportsVision: m.supportsVision || false,
      supportsTools: m.supportsTools || false,
      supportsStreaming: m.supportsStreaming ?? true,
      isActive: m.isActive ?? true,
    })),
  };

  const provider = providerStore.create(input);
  res.status(201).json(providerStore.toResponse(provider));
});

// POST /api/providers/test-connection - Test with raw config (before saving)
router.post('/test-connection', async (req: Request, res: Response) => {
  const { endpoint, apiKey, format, modelName } = req.body;

  if (!endpoint || !apiKey || !format || !modelName) {
    return res.status(400).json({ error: 'endpoint, apiKey, format, and modelName are required' });
  }

  const result = await testProviderConnection({
    endpoint: endpoint.trim().replace(/\/+$/, ''),
    apiKey: apiKey.trim(),
    format,
    modelName: modelName.trim(),
  });

  res.json(result);
});

// GET /api/providers/:id - Get single provider
router.get('/:id', (req: Request, res: Response) => {
  const provider = providerStore.get(req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }
  res.json(providerStore.toResponse(provider));
});

// PUT /api/providers/:id - Update provider
router.put('/:id', (req: Request, res: Response) => {
  const existing = providerStore.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const { name, endpoint, apiKey, format, models } = req.body;

  if (format && !VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: `Format must be one of: ${VALID_FORMATS.join(', ')}` });
  }

  const input: Partial<ProviderConfigInput> = {};
  if (name?.trim()) input.name = name.trim();
  if (endpoint?.trim()) input.endpoint = endpoint.trim().replace(/\/+$/, '');
  if (apiKey?.trim()) input.apiKey = apiKey.trim();
  if (format) input.format = format;
  if (models && Array.isArray(models) && models.length > 0) {
    input.models = models.map((m: any) => ({
      id: m.id || uuidv4(),
      name: m.name?.trim() || '',
      displayName: m.displayName?.trim() || undefined,
      contextSize: m.contextSize || 4096,
      supportsVision: m.supportsVision || false,
      supportsTools: m.supportsTools || false,
      supportsStreaming: m.supportsStreaming ?? true,
      isActive: m.isActive ?? true,
    }));
  }

  const updated = providerStore.update(req.params.id, input);
  if (!updated) {
    return res.status(500).json({ error: 'Failed to update provider' });
  }

  // Sync monitor targets: rename changed models, remove deleted ones
  const oldModelsById = new Map(existing.models.map(m => [m.id, m.name]));
  const newModelsById = new Map(updated.models.map(m => [m.id, m.name]));
  for (const [id, oldName] of oldModelsById) {
    const newName = newModelsById.get(id);
    if (!newName) {
      // Model was removed
      monitorConfigStore.removeTarget(req.params.id, oldName);
    } else if (newName !== oldName) {
      // Model was renamed
      monitorConfigStore.renameTarget(req.params.id, oldName, newName);
    }
  }

  res.json(providerStore.toResponse(updated));
});

// DELETE /api/providers/:id - Delete provider
router.delete('/:id', (req: Request, res: Response) => {
  const result = providerStore.delete(req.params.id);
  if (!result) {
    return res.status(404).json({ error: 'Provider not found' });
  }
  // Clean up monitor targets for this provider
  monitorConfigStore.removeTargetsByProvider(req.params.id);
  res.json({ success: true });
});

// POST /api/providers/:id/test - Test saved provider connection
router.post('/:id/test', async (req: Request, res: Response) => {
  const provider = providerStore.get(req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const activeModels = provider.models.filter(m => m.isActive !== false);
  const modelName = req.body.modelName || activeModels[0]?.name;
  if (!modelName) {
    return res.status(400).json({ error: 'No model specified' });
  }

  const apiKey = providerStore.getDecryptedApiKey(req.params.id);
  if (!apiKey) {
    return res.status(500).json({ error: 'Failed to decrypt API key' });
  }

  const result = await testProviderConnection({
    endpoint: provider.endpoint,
    apiKey,
    format: provider.format,
    modelName,
  });

  res.json(result);
});

export default router;

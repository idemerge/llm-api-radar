/**
 * Demo Mode utilities for sanitizing sensitive provider data in screenshots.
 *
 * Enable by running the dev server with `VITE_DEMO_MODE=true npm run dev`.
 * When enabled:
 *   - Provider names become `ProviderA`, `ProviderB`, ...
 *   - Endpoints become `https://api.provider-a.example.com/v1`
 *   - API keys become `sk-****`
 *
 * Mapping is stable per `id` for the lifetime of the page (first-seen order).
 * Excel-style letter sequence supports unlimited providers (A..Z, AA..AZ, ...).
 */

export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE === 'true';

// First-seen order map — stable within a session.
const idToIndex = new Map<string, number>();

function getIndex(id: string): number {
  if (!id) return 0;
  let idx = idToIndex.get(id);
  if (idx === undefined) {
    idx = idToIndex.size;
    idToIndex.set(id, idx);
  }
  return idx;
}

// 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, ...
function toLetters(n: number): string {
  let s = '';
  let x = n + 1;
  while (x > 0) {
    x--;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

export function maskProviderName(name: string, id: string): string {
  if (!DEMO_MODE) return name;
  return `Provider${toLetters(getIndex(id))}`;
}

export function maskEndpoint(url: string, id: string): string {
  if (!DEMO_MODE) return url;
  const letter = toLetters(getIndex(id)).toLowerCase();
  return `https://api.provider-${letter}.example.com/v1`;
}

export function maskApiKey(_keyMasked: string): string {
  if (!DEMO_MODE) return _keyMasked;
  return 'sk-****';
}

/** Mask a full ProviderConfigResponse-shaped object. */
export function maskProviderConfig<T extends { id: string; name: string; endpoint: string; apiKeyMasked: string }>(
  p: T,
): T {
  if (!DEMO_MODE) return p;
  return {
    ...p,
    name: maskProviderName(p.name, p.id),
    endpoint: maskEndpoint(p.endpoint, p.id),
    apiKeyMasked: maskApiKey(p.apiKeyMasked),
  };
}

/**
 * Mask a `providerName` field when only the providerId is available.
 * Used by history/monitor records that bake provider name into stored rows.
 */
export function maskProviderNameById(name: string, id: string): string {
  return maskProviderName(name, id);
}

/**
 * Mask a `providerLabels` map: { providerKey -> displayLabel }.
 * providerKey is `configId:modelName`; we mask only the configId portion.
 */
export function maskProviderLabels(labels?: Record<string, string>): Record<string, string> | undefined {
  if (!DEMO_MODE || !labels) return labels;
  const out: Record<string, string> = {};
  for (const [key, label] of Object.entries(labels)) {
    const [configId, modelName] = key.includes(':') ? key.split(':', 2) : [key, ''];
    const maskedName = maskProviderName(label.split('/')[0]?.trim() || label, configId);
    out[key] = modelName ? `${maskedName} / ${modelName}` : maskedName;
  }
  return out;
}

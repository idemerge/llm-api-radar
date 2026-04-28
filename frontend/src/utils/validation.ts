/**
 * Shared naming validation rules — mirrors backend schemas.ts.
 * Used for real-time input feedback in the UI.
 */

// Provider name: alphanumeric, dash, underscore, NO spaces, 1-64 chars
const PROVIDER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

// Model ID: alphanumeric, dash, underscore, dot, slash (LiteLLM vendor/model), 1-64 chars
const MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,63}$/;

// Display name: alphanumeric, space, dash, underscore, dot, 1-64 chars
const DISPLAY_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,63}$/;

export function validateProviderName(value: string): string | null {
  if (!value) return 'Provider name is required';
  if (!PROVIDER_NAME_RE.test(value)) return '1-64 chars: letters, digits, dash, underscore. No spaces.';
  return null;
}

export function validateModelId(value: string): string | null {
  if (!value) return 'Model ID is required';
  if (!MODEL_ID_RE.test(value)) return '1-64 chars: letters, digits, dash, underscore, dot, slash.';
  return null;
}

export function validateDisplayName(value: string): string | null {
  if (!value) return null; // optional
  if (!DISPLAY_NAME_RE.test(value)) return '1-64 chars: letters, digits, space, dash, underscore, dot.';
  return null;
}

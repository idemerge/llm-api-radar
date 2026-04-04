const TOKEN_KEY = 'llm_bench_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/**
 * Wrapper around fetch that injects the Authorization header.
 * If the response is 401, clears the token and redirects to /login.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    clearToken();
    // Dispatch event so App can react to it
    window.dispatchEvent(new CustomEvent('auth-expired'));
  }

  return response;
}

/**
 * Build an SSE URL with the token as a query parameter.
 * EventSource does not support custom headers.
 */
export function sseUrl(path: string): string {
  const token = getToken();
  const separator = path.includes('?') ? '&' : '?';
  return token ? `${path}${separator}token=${token}` : path;
}

/**
 * Build a download URL with the token as a query parameter.
 * window.open() cannot set headers.
 */
export function downloadUrl(path: string): string {
  const token = getToken();
  const separator = path.includes('?') ? '&' : '?';
  return token ? `${path}${separator}token=${token}` : path;
}

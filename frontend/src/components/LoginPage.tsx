import { useState } from 'react';
import { Button, Alert } from '../antdImports';
import { useAuth } from '../hooks/useAuth';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const { loading, error, login, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) {
      onLoginSuccess();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-[384px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded bg-accent-teal flex items-center justify-center text-bg-primary text-sm font-bold">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="7" width="4" height="6" rx="1" fill="currentColor" opacity="0.9" />
              <rect x="5" y="4" width="4" height="9" rx="1" fill="currentColor" />
              <rect x="9" y="1" width="4" height="12" rx="1" fill="currentColor" opacity="0.9" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-text-primary">LLM API Radar</span>
        </div>

        {/* Login Card */}
        <div className="bg-bg-surface border border-border rounded-lg p-6">
          <h2 className="text-text-primary text-base font-medium mb-4">Sign in</h2>

          {error && (
            <Alert message={error} type="error" showIcon closable onClose={clearError} style={{ marginBottom: 16 }} />
          )}

          <form onSubmit={handleSubmit} method="post" action="/api/auth/login">
            <div className="mb-4">
              <label htmlFor="login-username" className="block text-text-secondary text-xs mb-1.5">
                Username
              </label>
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                className="w-full h-10 px-3 rounded-md border border-border bg-bg-primary text-text-primary text-sm outline-none focus:border-accent-teal transition-colors"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="login-password" className="block text-text-secondary text-xs mb-1.5">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full h-10 px-3 rounded-md border border-border bg-bg-primary text-text-primary text-sm outline-none focus:border-accent-teal transition-colors"
              />
            </div>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ marginTop: 8 }}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

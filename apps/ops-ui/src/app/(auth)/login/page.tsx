'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient } from '@/lib/api';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', {
        username,
        password,
        ...(needTotp && totpToken ? { totpToken } : {}),
      });

      console.log(res);

      setAuth(res.data.accessToken, res.data.user);
      router.push('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed';
      if (msg === 'TOTP token required') setNeedTotp(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const optionsRes = await apiClient.post('/auth/passkey/login/options');
      const options = optionsRes.data;

      const credential = await startAuthentication({
        optionsJSON: options,
      });

      const verifyRes = await apiClient.post('/auth/passkey/login/verify', credential);

      setAuth(verifyRes.data.accessToken, verifyRes.data.user);
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Passkey authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-4">
            <span className="text-primary text-xl font-bold">M</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Hamyar Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                placeholder="admin"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {needTotp && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Authenticator Code</label>
                <input
                  type="text"
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors font-mono"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-4 text-muted-foreground text-xs uppercase">or</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="w-full py-2.5 bg-surface-2 hover:bg-surface border border-border text-foreground text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Fingerprint className="w-4 h-4 text-primary" />
              Sign in with Passkey
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">Hamyar Ops v1.0</p>
      </div>
    </div>
  );
}

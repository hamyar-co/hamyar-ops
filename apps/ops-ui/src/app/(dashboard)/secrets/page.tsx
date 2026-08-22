'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface VaultStatusDto {
  ansible: {
    configured: boolean;
    passwordSet: boolean;
  };
  hcp: {
    configured: boolean;
    reachable: boolean;
    addr?: string;
    error?: string;
  };
}

interface AppConfigBasic {
  name: string;
  pm2Name: string;
}

interface EnvVar {
  key: string;
  value: string;
}

interface EncryptedVarDto {
  key: string;
  encrypted: string;
}

export default function SecretsPage() {
  const [tab, setTab] = useState<'app-env' | 'ansible-vault' | 'hcp-vault'>('app-env');

  // App Env state
  const [selectedApp, setSelectedApp] = useState('');
  const [maskedKeys, setMaskedKeys] = useState<Set<string>>(new Set());

  // Ansible Vault state
  const [vaultPwForm, setVaultPwForm] = useState({ password: '', confirm: '' });
  const [vaultPwError, setVaultPwError] = useState('');
  const [vaultPwSuccess, setVaultPwSuccess] = useState(false);
  const [encForm, setEncForm] = useState({ key: '', value: '', password: '' });
  const [encResult, setEncResult] = useState<string | null>(null);
  const [decForm, setDecForm] = useState({ encrypted: '', password: '' });
  const [decResult, setDecResult] = useState<string | null>(null);

  const { data: vaultStatus } = useQuery({
    queryKey: ['vault-status'],
    queryFn: () => apiClient.get('/secrets/vault-status').then((r) => r.data as VaultStatusDto),
  });

  const { data: apps } = useQuery({
    queryKey: ['applications-list'],
    queryFn: () => apiClient.get('/applications').then((r) => r.data as AppConfigBasic[]),
  });

  const { data: envVars, isLoading: envLoading } = useQuery({
    queryKey: ['env-vars', selectedApp],
    queryFn: () => apiClient.get(`/env/${selectedApp}`).then((r) => r.data as EnvVar[]),
    enabled: !!selectedApp,
  });

  const setVaultPw = useMutation({
    mutationFn: (password: string) => apiClient.post('/secrets/vault-password', { password }),
    onSuccess: () => {
      setVaultPwSuccess(true);
      setVaultPwError('');
      setVaultPwForm({ password: '', confirm: '' });
      setTimeout(() => setVaultPwSuccess(false), 3000);
    },
    onError: (e: any) => setVaultPwError(e.response?.data?.message || 'Failed to set password'),
  });

  const encryptVar = useMutation({
    mutationFn: (body: { key: string; value: string; password: string }) =>
      apiClient.post('/secrets/ansible/encrypt', body).then((r) => r.data as EncryptedVarDto),
    onSuccess: (data) => setEncResult(data.encrypted),
    onError: (e: any) => setEncResult(`Error: ${e.response?.data?.message || e.message}`),
  });

  const decryptVar = useMutation({
    mutationFn: (body: { encrypted: string; password: string }) =>
      apiClient.post('/secrets/ansible/decrypt', body).then((r) => r.data),
    onSuccess: (data) => setDecResult(typeof data === 'string' ? data : data.decrypted ?? JSON.stringify(data)),
    onError: (e: any) => setDecResult(`Error: ${e.response?.data?.message || e.message}`),
  });

  const toggleMask = (key: string) => {
    setMaskedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSetVaultPw = () => {
    if (vaultPwForm.password !== vaultPwForm.confirm) {
      setVaultPwError('Passwords do not match');
      return;
    }
    setVaultPw.mutate(vaultPwForm.password);
  };

  const tabs = [
    { id: 'app-env' as const, label: 'App Env' },
    { id: 'ansible-vault' as const, label: 'Ansible Vault' },
    { id: 'hcp-vault' as const, label: 'HashiCorp Vault' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Secrets</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage environment variables, Ansible Vault, and HashiCorp Vault</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors -mb-px border-b-2 ${
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── App Env ── */}
      {tab === 'app-env' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedApp}
              onChange={(e) => { setSelectedApp(e.target.value); setMaskedKeys(new Set()); }}
              className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground"
            >
              <option value="">Select an application…</option>
              {(apps ?? []).map((a) => (
                <option key={a.pm2Name} value={a.pm2Name}>{a.name}</option>
              ))}
            </select>
          </div>

          {!selectedApp && (
            <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              Select an application above to view its environment variables
            </div>
          )}

          {selectedApp && envLoading && (
            <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              Loading…
            </div>
          )}

          {selectedApp && !envLoading && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">.env — {selectedApp}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{(envVars ?? []).length} variables</p>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-1/3">Key</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Value</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-16">Show</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(envVars ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-10 text-muted-foreground">No environment variables found</td>
                    </tr>
                  )}
                  {(envVars ?? []).map((v) => (
                    <tr key={v.key} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{v.key}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {maskedKeys.has(v.key) ? v.value : '•'.repeat(Math.min(v.value.length, 16))}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => toggleMask(v.key)}
                          className="px-2 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {maskedKeys.has(v.key) ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Ansible Vault ── */}
      {tab === 'ansible-vault' && (
        <div className="space-y-6">
          {/* Status */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Ansible Vault Status</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">ANSIBLE_VAULT_PASSWORD env:</span>
                <StatusBadge status={vaultStatus?.ansible.configured ? 'running' : 'stopped'} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Master password stored:</span>
                <StatusBadge status={vaultStatus?.ansible.passwordSet ? 'running' : 'stopped'} />
              </div>
            </div>
          </div>

          {/* Set Vault Password */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3 max-w-lg">
            <h3 className="text-sm font-semibold text-foreground">Set Vault Password</h3>
            <p className="text-xs text-muted-foreground">Store a bcrypt-hashed master vault password. Used to verify operator identity before encrypt/decrypt operations.</p>
            <input
              type="password"
              value={vaultPwForm.password}
              onChange={(e) => setVaultPwForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="New vault password (min 8 chars)"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
            <input
              type="password"
              value={vaultPwForm.confirm}
              onChange={(e) => setVaultPwForm((f) => ({ ...f, confirm: e.target.value }))}
              placeholder="Confirm password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
            {vaultPwError && <p className="text-xs text-error">{vaultPwError}</p>}
            {vaultPwSuccess && <p className="text-xs text-success">Vault password updated successfully</p>}
            <button
              onClick={handleSetVaultPw}
              disabled={!vaultPwForm.password || !vaultPwForm.confirm || setVaultPw.isPending}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {setVaultPw.isPending ? 'Saving…' : 'Set Password'}
            </button>
          </div>

          {/* Encrypt Variable */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3 max-w-lg">
            <h3 className="text-sm font-semibold text-foreground">Encrypt Variable</h3>
            <p className="text-xs text-muted-foreground">Encrypt a value using <code className="font-mono">ansible-vault encrypt_string</code>.</p>
            <input
              value={encForm.key}
              onChange={(e) => setEncForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="Variable name (e.g. db_password)"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
            <input
              type="password"
              value={encForm.value}
              onChange={(e) => setEncForm((f) => ({ ...f, value: e.target.value }))}
              placeholder="Secret value to encrypt"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
            <input
              type="password"
              value={encForm.password}
              onChange={(e) => setEncForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Vault password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={() => encryptVar.mutate(encForm)}
              disabled={!encForm.key || !encForm.value || !encForm.password || encryptVar.isPending}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {encryptVar.isPending ? 'Encrypting…' : 'Encrypt'}
            </button>
            {encResult && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Encrypted output (paste into your playbook):</p>
                <pre className="p-3 rounded-lg bg-surface-2/90 border border-border text-xs font-mono text-success overflow-x-auto whitespace-pre-wrap break-all">
                  {encResult}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(encResult)}
                  className="mt-1 px-2 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          {/* Decrypt Variable */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3 max-w-lg">
            <h3 className="text-sm font-semibold text-foreground">Decrypt Variable</h3>
            <p className="text-xs text-muted-foreground">Paste an encrypted ansible-vault block to decrypt it.</p>
            <textarea
              value={decForm.encrypted}
              onChange={(e) => setDecForm((f) => ({ ...f, encrypted: e.target.value }))}
              placeholder={'!vault |\n  $ANSIBLE_VAULT;1.1;AES256\n  ...'}
              rows={6}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-surface-2/90 border border-border text-foreground placeholder:text-muted-foreground"
            />
            <input
              type="password"
              value={decForm.password}
              onChange={(e) => setDecForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Vault password"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={() => decryptVar.mutate(decForm)}
              disabled={!decForm.encrypted || !decForm.password || decryptVar.isPending}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {decryptVar.isPending ? 'Decrypting…' : 'Decrypt'}
            </button>
            {decResult && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Decrypted value:</p>
                <pre className="p-3 rounded-lg bg-surface-2/90 border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
                  {decResult}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HashiCorp Vault ── */}
      {tab === 'hcp-vault' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">HashiCorp Vault Status</h3>

            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">VAULT_ADDR configured:</span>
                <StatusBadge status={vaultStatus?.hcp.configured ? 'running' : 'stopped'} />
              </div>
              {vaultStatus?.hcp.configured && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Reachable:</span>
                  <StatusBadge status={vaultStatus.hcp.reachable ? 'running' : 'errored'} />
                </div>
              )}
            </div>

            {vaultStatus?.hcp.configured && (
              <div className="text-sm">
                <span className="text-muted-foreground">Address: </span>
                <code className="font-mono text-xs text-foreground">{vaultStatus.hcp.addr}</code>
              </div>
            )}

            {vaultStatus?.hcp.configured && vaultStatus.hcp.reachable && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                <span className="text-success text-sm font-medium">✓ Connected to HashiCorp Vault</span>
              </div>
            )}

            {vaultStatus?.hcp.configured && !vaultStatus.hcp.reachable && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/20 space-y-1">
                <p className="text-error text-sm font-medium">✗ Vault is unreachable</p>
                {vaultStatus.hcp.error && (
                  <p className="text-xs text-muted-foreground font-mono">{vaultStatus.hcp.error}</p>
                )}
              </div>
            )}

            {!vaultStatus?.hcp.configured && (
              <div className="p-4 rounded-lg bg-surface-2 border border-border space-y-2">
                <p className="text-sm font-medium text-foreground">HashiCorp Vault is not configured</p>
                <p className="text-xs text-muted-foreground">Set the <code className="font-mono">VAULT_ADDR</code> environment variable to the address of your Vault cluster to enable integration.</p>
                <pre className="mt-2 p-2 rounded bg-surface-2/90 text-xs font-mono text-muted-foreground">
                  {'VAULT_ADDR=https://vault.example.com:8200'}
                </pre>
                <p className="text-xs text-muted-foreground">Restart the API service after setting the variable for the change to take effect.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

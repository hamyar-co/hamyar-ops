'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuthStore } from '@/stores/auth.store';
import { useFeatureToggleStore } from '@/stores/featureToggle.store';
import { CustomSwitch } from '@/components/ui/CustomSwitch';
import { CustomButton } from '@/components/ui/CustomButton';
import { StatusBadge } from '@/components/shared/StatusBadge';

export default function SettingsPage() {
  const [tab, setTab] = useState<'general' | 'features' | 'account' | 'audit' | 'ports' | 's3' | 'backup-strategies' | 'full-backup'>('general');
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const qc = useQueryClient();

  // Change password state
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // Profile edit state
  const [profileForm, setProfileForm] = useState({ username: user?.username ?? '', email: user?.email ?? '' });
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  // TOTP state
  const [totpSetup, setTotpSetup] = useState<{ qrCode: string; secret: string; backupCodes: string[] } | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [totpError, setTotpError] = useState('');
  const [disableTotpToken, setDisableTotpToken] = useState('');
  const [showDisableForm, setShowDisableForm] = useState(false);

  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiClient.get('/audit?page=1&limit=50').then((r) => r.data as { items: any[]; total: number }),
    enabled: tab === 'audit',
  });

  const changePassword = useMutation({
    mutationFn: () => apiClient.patch('/users/me/password', {
      currentPassword: pwForm.currentPassword,
      newPassword: pwForm.newPassword,
    }),
    onSuccess: () => {
      setPwSuccess(true);
      setPwError('');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    },
    onError: (e: any) => setPwError(e.response?.data?.message || 'Failed to change password'),
  });

  const updateProfile = useMutation({
    mutationFn: () => apiClient.patch('/users/me/profile', profileForm),
    onSuccess: (res) => {
      setProfileSuccess(true);
      setProfileError('');
      const token = useAuthStore.getState().accessToken;
      if (user && token) setAuth(token, { ...user, ...res.data });
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (e: any) => setProfileError(e.response?.data?.message || 'Failed to update profile'),
  });

  const setupTotp = useMutation({
    mutationFn: () => apiClient.post('/auth/totp/setup'),
    onSuccess: (res) => setTotpSetup(res.data),
    onError: (e: any) => setTotpError(e.response?.data?.message || 'Failed to start 2FA setup'),
  });

  const verifyTotp = useMutation({
    mutationFn: () => apiClient.post('/auth/totp/verify', { token: totpToken }),
    onSuccess: () => {
      setTotpSetup(null);
      setTotpToken('');
      setTotpError('');
      if (user) setAuth(useAuthStore.getState().accessToken!, { ...user, totpEnabled: true });
    },
    onError: (e: any) => setTotpError(e.response?.data?.message || 'Invalid code'),
  });

  const disableTotp = useMutation({
    mutationFn: () => apiClient.post('/users/me/totp/disable', { token: disableTotpToken }),
    onSuccess: () => {
      if (user) setAuth(useAuthStore.getState().accessToken!, { ...user, totpEnabled: false });
      setShowDisableForm(false);
      setDisableTotpToken('');
    },
    onError: (e: any) => setTotpError(e.response?.data?.message || 'Failed to disable 2FA'),
  });

  // Passkeys state
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeySuccess, setPasskeySuccess] = useState('');

  const { data: passkeys = [], refetch: refetchPasskeys } = useQuery({
    queryKey: ['my-passkeys'],
    queryFn: () => apiClient.get('/users/me/passkeys').then((r) => r.data as { id: string; name: string; createdAt: string }[]),
    enabled: tab === 'account',
  });

  const deletePasskey = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/me/passkeys/${id}`),
    onSuccess: () => refetchPasskeys(),
    onError: (e: any) => alert(e.response?.data?.message || 'Failed to delete passkey'),
  });

  const registerPasskey = useMutation({
    mutationFn: async () => {
      setPasskeyError('');
      setPasskeySuccess('');
      const optionsRes = await apiClient.post('/auth/passkey/register/options');
      const options = optionsRes.data;

      const credential = await startRegistration({
        optionsJSON: options,
      });

      await apiClient.post('/auth/passkey/register/verify', {
        name: newPasskeyName || 'My Passkey',
        response: credential,
      });
    },
    onSuccess: () => {
      setPasskeySuccess('Passkey registered successfully!');
      setNewPasskeyName('');
      refetchPasskeys();
    },
    onError: (e: any) => {
      console.error(e);
      setPasskeyError(e.response?.data?.message || e.message || 'Failed to register passkey');
    },
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    changePassword.mutate();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        {user?.role === 'ADMIN' && (
          <a
            href="/users"
            className="px-3 py-1.5 text-xs bg-primary/10 border border-primary/20 text-primary rounded-lg hover:bg-primary/20 transition-colors"
          >
            Manage Users
          </a>
        )}
      </div>

      <div className="flex gap-1 border-b border-border flex-wrap">
        {(['general', 'features', 'account', 'audit', 's3', 'backup-strategies', 'full-backup'] as const)
          .filter((t) => user?.role === 'ADMIN' || ['general', 'features', 'account'].includes(t))
          .map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize transition-colors -mb-px border-b-2 ${
                tab === t ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'features' ? 'Menu & Features' : t === 's3' ? 'S3 Storage' : t === 'backup-strategies' ? 'Backup Strategies' : t === 'full-backup' ? 'Full Backup' : t === 'account' ? 'Account & Security' : t}
            </button>
          ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Infrastructure</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Server</span>
                <span className="font-mono text-foreground">91.220.113.171</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Docker Compose</span>
                <span className="font-mono text-foreground text-xs">/opt/hamyar/backend/docker-compose.yml</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">PM2 Ecosystem</span>
                <span className="font-mono text-foreground text-xs">/opt/hamyar/ecosystem.config.js</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Log Directory</span>
                <span className="font-mono text-foreground text-xs">/var/log/hamyar</span>
              </div>
            </div>
          </div>
          <ApiEventsSettings />
        </div>
      )}

      {tab === 'features' && <FeaturesCustomizerSection />}

      {tab === 'account' && (
        <div className="space-y-4">
          {/* Profile info */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Profile</h3>
            <form onSubmit={(e) => { e.preventDefault(); setProfileError(''); updateProfile.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Username</label>
                  <input
                    value={profileForm.username}
                    onChange={(e) => setProfileForm(f => ({ ...f, username: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    user?.role === 'ADMIN' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'
                  }`}>{user?.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  {profileError && <span className="text-xs text-error">{profileError}</span>}
                  {profileSuccess && <span className="text-xs text-success">Saved</span>}
                  <button type="submit" disabled={updateProfile.isPending} className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
                    {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Change password */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Current Password</label>
                <input
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">New Password</label>
                  <input
                    type="password"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Confirm New Password</label>
                  <input
                    type="password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  {pwError && <p className="text-xs text-error">{pwError}</p>}
                  {pwSuccess && <p className="text-xs text-success">Password changed successfully</p>}
                </div>
                <button type="submit" disabled={changePassword.isPending} className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
                  {changePassword.isPending ? 'Changing…' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>

          {/* 2FA */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Two-Factor Authentication</h3>
              <span className={`text-xs px-2 py-0.5 rounded border ${user?.totpEnabled ? 'bg-success/10 text-success border-success/20' : 'bg-surface-2 text-muted-foreground border-border'}`}>
                {user?.totpEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {totpError && <p className="text-xs text-error mb-3">{totpError}</p>}

            {!user?.totpEnabled && !totpSetup && (
              <button onClick={() => setupTotp.mutate()} disabled={setupTotp.isPending} className="px-4 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {setupTotp.isPending ? 'Setting up…' : 'Enable 2FA'}
              </button>
            )}

            {totpSetup && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
                <img src={totpSetup.qrCode} alt="2FA QR Code" className="w-40 h-40 rounded-lg border border-border" />
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Manual key: <span className="font-mono text-foreground">{totpSetup.secret}</span></label>
                </div>

                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-warning">Save your backup codes — they won't be shown again</p>
                  <p className="text-xs text-muted-foreground">Each code can only be used once as an alternative to your authenticator.</p>
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {totpSetup.backupCodes.map((code) => (
                      <span key={code} className="font-mono text-xs bg-surface-2 border border-border rounded px-2 py-1 text-foreground tracking-widest">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={totpToken}
                    onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    placeholder="000000"
                    className="w-32 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={() => verifyTotp.mutate()} disabled={verifyTotp.isPending || totpToken.length !== 6} className="px-4 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
                    {verifyTotp.isPending ? 'Verifying…' : 'Verify & Enable'}
                  </button>
                  <button onClick={() => { setTotpSetup(null); setTotpToken(''); setTotpError(''); }} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {user?.totpEnabled && !totpSetup && (
              <div className="space-y-3">
                {!showDisableForm ? (
                  <button
                    onClick={() => { setShowDisableForm(true); setTotpError(''); }}
                    className="px-4 py-2 text-xs bg-error/10 text-error border border-error/20 rounded-lg hover:bg-error/20"
                  >
                    Disable 2FA
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Enter your authenticator code (or a backup code) to confirm.</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={disableTotpToken}
                        onChange={(e) => setDisableTotpToken(e.target.value.replace(/\s/g, '').slice(0, 8))}
                        placeholder="000000"
                        className="w-36 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-error"
                      />
                      <button
                        onClick={() => disableTotp.mutate()}
                        disabled={disableTotp.isPending || disableTotpToken.length < 6}
                        className="px-4 py-2 text-xs bg-error/10 text-error border border-error/20 rounded-lg hover:bg-error/20 disabled:opacity-50"
                      >
                        {disableTotp.isPending ? 'Disabling…' : 'Confirm Disable'}
                      </button>
                      <button
                        onClick={() => { setShowDisableForm(false); setDisableTotpToken(''); setTotpError(''); }}
                        className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Passkeys Section */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-1">Passkeys</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Register security keys, biometrics (Touch ID / Face ID), or device locks to sign in without typing your password or 2FA codes.
            </p>

            {/* List of Passkeys */}
            {passkeys.length > 0 ? (
              <div className="space-y-2 mb-4">
                {passkeys.map((pk) => (
                  <div key={pk.id} className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">{pk.name}</p>
                      <p className="text-xs text-muted-foreground">Added on {new Date(pk.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to remove this passkey?')) {
                          deletePasskey.mutate(pk.id);
                        }
                      }}
                      disabled={deletePasskey.isPending}
                      className="px-2 py-1 text-xs text-error hover:bg-error/10 border border-transparent rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-4 italic">No passkeys registered yet.</p>
            )}

            {/* Add Passkey Form */}
            <div className="border-t border-border/50 pt-4 space-y-3">
              <h4 className="text-xs font-semibold text-foreground">Add a Passkey</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. My MacBook Pro"
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => registerPasskey.mutate()}
                  disabled={registerPasskey.isPending || !newPasskeyName}
                  className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {registerPasskey.isPending ? 'Registering...' : 'Register'}
                </button>
              </div>
              {passkeyError && <p className="text-xs text-error">{passkeyError}</p>}
              {passkeySuccess && <p className="text-xs text-success">{passkeySuccess}</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Action</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">User</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">IP</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLoading && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              )}
              {!auditLoading && (auditLogs?.items ?? []).length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No audit entries</td></tr>
              )}
              {(auditLogs?.items ?? []).map((log: any) => (
                <tr key={log.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{log.action}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{log.user?.username ?? '–'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{log.ipAddress ?? '–'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 's3' && <S3Section />}
      {tab === 'backup-strategies' && <BackupStrategiesSection />}
      {tab === 'full-backup' && <FullBackupSection />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// API Events Logging Settings
// ───────────────────────────────────────────────────────────────────
function ApiEventsSettings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get('/settings').then((r) => r.data),
  });

  const updateSetting = useMutation({
    mutationFn: (enabled: boolean) => apiClient.patch('/settings', { api_event_logging_enabled: enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const isEnabled = settings?.api_event_logging_enabled ?? false;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Full Event Logging</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-[500px]">
            Optionally enable verbose logging of all API modifications (create app, deploy, add server, etc). 
            This captures the exact request and response payloads in the Events feed.
          </p>
        </div>
        <button
          onClick={() => updateSetting.mutate(!isEnabled)}
          disabled={updateSetting.isPending}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
            isEnabled 
              ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
              : 'bg-surface-2 text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          {updateSetting.isPending ? 'Updating...' : isEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// S3 compatible storage configs
// ───────────────────────────────────────────────────────────────────
function S3Section() {
  const qc = useQueryClient();
  const { data: configs = [] } = useQuery({
    queryKey: ['s3-configs'],
    queryFn: () => apiClient.get('/backups/s3').then((r) => r.data as any[]),
  });
  const [form, setForm] = useState({ name: '', endpoint: '', region: 'default', bucket: '', accessKeyId: '', secretAccessKey: '', usePathStyle: true });
  const create = useMutation({
    mutationFn: () => apiClient.post('/backups/s3', form),
    onSuccess: () => { setForm({ name: '', endpoint: '', region: 'default', bucket: '', accessKeyId: '', secretAccessKey: '', usePathStyle: true }); qc.invalidateQueries({ queryKey: ['s3-configs'] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => apiClient.delete(`/backups/s3/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['s3-configs'] }) });
  const test = useMutation({ mutationFn: (id: string) => apiClient.post(`/backups/s3/${id}/test`) });

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Add S3-compatible endpoint</h3>
        <p className="text-xs text-muted-foreground">Works with AWS S3, MinIO, Cloudflare R2, Backblaze, etc. Secrets are stored in the ops database.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="name (e.g. offsite)" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://s3.amazonaws.com or http://minio:9000" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="region" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <input value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} placeholder="bucket name" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <input value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} placeholder="access key id" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <input value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} placeholder="secret access key" type="password" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
        </div>
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          <input type="checkbox" checked={form.usePathStyle} onChange={(e) => setForm({ ...form, usePathStyle: e.target.checked })} />
          Use path-style addressing (required for MinIO / self-hosted)
        </label>
        <button onClick={() => create.mutate()} disabled={!form.name || !form.endpoint || !form.bucket || create.isPending} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
          {create.isPending ? 'Saving…' : 'Add endpoint'}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-surface-2">Endpoints</div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Name</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Endpoint</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Bucket</th>
            <th className="text-right text-xs text-muted-foreground px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {configs.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-6">No S3 endpoints yet</td></tr>}
            {configs.map((c) => (
              <tr key={c.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 text-foreground">{c.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{c.endpoint}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{c.bucket}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => test.mutate(c.id)} className="px-2 py-0.5 text-xs rounded bg-info/10 text-info hover:bg-info/20 mr-1">
                    {test.isPending && test.variables === c.id ? 'Testing…' : 'Test'}
                  </button>
                  <button onClick={() => remove.mutate(c.id)} className="px-2 py-0.5 text-xs rounded bg-error/10 text-error hover:bg-error/20">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {test.data && <div className="px-4 py-2 text-xs"><span className={test.data.data?.ok ? 'text-success' : 'text-error'}>{test.data.data?.message}</span></div>}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Backup strategies (multiple schedules + per-strategy retention)
// ───────────────────────────────────────────────────────────────────
const PRESET_CODONS = [
  { label: 'Hourly', cron: '0 * * * *', retention: 1024 },
  { label: 'Daily', cron: '0 3 * * *', retention: 30 },
  { label: 'Monthly', cron: '0 3 1 * *', retention: 12 },
  { label: 'Midnight', cron: '0 0 * * *', retention: 30 },
];

function BackupStrategiesSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ name: '', targetType: 'app', targets: [], storage: 'local', s3ConfigId: '', scheduleCron: '0 3 * * *', retentionMax: 30, enabled: true });
  const [selectedDb, setSelectedDb] = useState<{ container: string; engine: string; database: string } | null>(null);

  const { data: strategies = [] } = useQuery({
    queryKey: ['backup-strategies'],
    queryFn: () => apiClient.get('/backups/strategies').then((r) => r.data as any[]),
  });
  const { data: s3configs = [] } = useQuery({
    queryKey: ['s3-configs'],
    queryFn: () => apiClient.get('/backups/s3').then((r) => r.data as any[]),
  });
  const { data: apps = [] } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get('/applications').then((r) => r.data as any[]),
  });
  const { data: databases = [] } = useQuery({
    queryKey: ['docker-databases'],
    queryFn: () => apiClient.get('/docker/db/databases').then((r) => r.data as any[]),
    enabled: true,
  });
  const { data: containers = [] } = useQuery({
    queryKey: ['docker-containers'],
    queryFn: () => apiClient.get('/docker/containers').then((r) => r.data as any[]),
    enabled: form.targetType === 'container',
  });
  const { data: composeFiles = [] } = useQuery({
    queryKey: ['docker-compose-files'],
    queryFn: () => apiClient.get('/docker/compose/files').then((r) => r.data as any[]),
    enabled: form.targetType === 'compose',
  });
  const create = useMutation({
    mutationFn: () => apiClient.post('/backups/strategies', {
      ...form,
      targets: Array.isArray(form.targets) ? form.targets : String(form.targets).split(',').map((t: string) => t.trim()).filter(Boolean),
      s3ConfigId: form.s3ConfigId || null,
      retentionMax: Number(form.retentionMax),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backup-strategies'] }); setForm({ name: '', targetType: 'app', targets: [], storage: 'local', s3ConfigId: '', scheduleCron: '0 3 * * *', retentionMax: 30, enabled: true }); setSelectedDb(null); },
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => apiClient.put(`/backups/strategies/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup-strategies'] }),
  });
  const remove = useMutation({ mutationFn: (id: string) => apiClient.delete(`/backups/strategies/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['backup-strategies'] }) });

  const applyPreset = (p: (typeof PRESET_CODONS)[number]) => setForm((f: any) => ({ ...f, scheduleCron: p.cron, retentionMax: p.retention }));

  const addDatabaseTarget = () => {
    if (!selectedDb) return;
    const target = `${selectedDb.container}::${selectedDb.engine}::${selectedDb.database}`;
    if (!(form.targets as string[]).includes(target)) {
      setForm((f: any) => ({ ...f, targets: [...(f.targets as string[]), target] }));
    }
    setSelectedDb(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">New backup strategy</h3>
        <p className="text-xs text-muted-foreground">Multiple strategies allowed — e.g. hourly offsite to S3 (keep 1024) + daily local (keep 30). Local backups auto-expire after 24h.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="strategy name" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, targets: [] })} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border">
            <option value="app">Applications</option>
            <option value="database">Databases</option>
            <option value="container">Containers</option>
            <option value="compose">Compose files</option>
          </select>
          {form.targetType === 'app' ? (
            <div className="md:col-span-2 border border-border rounded-lg bg-surface-2 p-3 max-h-40 overflow-y-auto space-y-1">
              {(apps ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No applications registered</p>
              )}
              {(apps ?? []).map((a: any) => {
                const checked = (form.targets as string[]).includes(a.pm2Name);
                return (
                  <label key={a.pm2Name} className="flex items-center gap-2 text-sm text-foreground cursor-pointer hover:bg-surface rounded px-1.5 py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((f: any) => ({
                        ...f,
                        targets: e.target.checked
                          ? [...(f.targets as string[]), a.pm2Name]
                          : (f.targets as string[]).filter((t: string) => t !== a.pm2Name),
                      }))}
                    />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{a.pm2Name}</span>
                  </label>
                );
              })}
            </div>
          ) : form.targetType === 'database' ? (
            <div className="md:col-span-2 space-y-3">
              <div className="border border-border rounded-lg bg-surface-2 p-3 max-h-60 overflow-y-auto space-y-2">
                {(databases ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No database containers found. Make sure PostgreSQL or MySQL containers are running.</p>
                )}
                {(databases ?? []).map((db: any) => (
                  <div key={db.containerId} className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">{db.containerName} ({db.engine})</p>
                    {db.databases.map((database: string) => {
                      const target = `${db.containerName}::${db.engine}::${database}`;
                      const checked = (form.targets as string[]).includes(target);
                      return (
                        <label key={database} className="flex items-center gap-2 text-sm text-foreground cursor-pointer hover:bg-surface rounded px-1.5 py-1 ml-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setForm((f: any) => ({
                              ...f,
                              targets: e.target.checked
                                ? [...(f.targets as string[]), target]
                                : (f.targets as string[]).filter((t: string) => t !== target),
                            }))}
                          />
                          <span className="font-mono text-xs">{database}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedDb?.container || ''}
                  onChange={(e) => {
                    const db = databases.find((d: any) => d.containerId === e.target.value || d.containerName === e.target.value);
                    setSelectedDb(db ? { container: db.containerName, engine: db.engine, database: db.databases[0] || '' } : null);
                  }}
                  className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border flex-1"
                >
                  <option value="">— select container —</option>
                  {(databases ?? []).map((db: any) => (
                    <option key={db.containerId} value={db.containerName}>{db.containerName} ({db.engine})</option>
                  ))}
                </select>
                <select
                  value={selectedDb?.database || ''}
                  onChange={(e) => setSelectedDb((prev) => prev ? { ...prev, database: e.target.value } : null)}
                  disabled={!selectedDb}
                  className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border flex-1 disabled:opacity-50"
                >
                  <option value="">— select database —</option>
                  {(databases.find((d: any) => d.containerName === selectedDb?.container)?.databases ?? []).map((db: string) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
                <button
                  onClick={addDatabaseTarget}
                  disabled={!selectedDb}
                  className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          ) : form.targetType === 'container' ? (
            <div className="md:col-span-2 border border-border rounded-lg bg-surface-2 p-3 max-h-40 overflow-y-auto space-y-1">
              {(containers ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No Docker containers running</p>
              )}
              {(containers ?? []).map((c: any) => {
                const checked = (form.targets as string[]).includes(c.name);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer hover:bg-surface rounded px-1.5 py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((f: any) => ({
                        ...f,
                        targets: e.target.checked
                          ? [...(f.targets as string[]), c.name]
                          : (f.targets as string[]).filter((t: string) => t !== c.name),
                      }))}
                    />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.id}</span>
                  </label>
                );
              })}
            </div>
          ) : form.targetType === 'compose' ? (
            <div className="md:col-span-2 border border-border rounded-lg bg-surface-2 p-3 max-h-40 overflow-y-auto space-y-1">
              {(composeFiles ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No compose projects saved</p>
              )}
              {(composeFiles ?? []).map((cf: any) => {
                const checked = (form.targets as string[]).includes(cf.name);
                return (
                  <label key={cf.file} className="flex items-center gap-2 text-sm text-foreground cursor-pointer hover:bg-surface rounded px-1.5 py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((f: any) => ({
                        ...f,
                        targets: e.target.checked
                          ? [...(f.targets as string[]), cf.name]
                          : (f.targets as string[]).filter((t: string) => t !== cf.name),
                      }))}
                    />
                    <span className="font-medium">{cf.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{cf.file}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <input value={form.targets as string} onChange={(e) => setForm({ ...form, targets: e.target.value })} placeholder="comma-separated targets" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border md:col-span-2" />
          )}
          <select value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border">
            <option value="local">Local (/var/backups)</option>
            <option value="s3">S3-compatible (offsite)</option>
          </select>
          <select value={form.s3ConfigId} onChange={(e) => setForm({ ...form, s3ConfigId: e.target.value })} disabled={form.storage !== 's3'} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border disabled:opacity-50">
            <option value="">— select S3 endpoint —</option>
            {s3configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={form.scheduleCron} onChange={(e) => setForm({ ...form, scheduleCron: e.target.value })} placeholder="cron expression" className="px-3 py-2 text-sm font-mono rounded-lg bg-surface-2 border border-border" />
          <input type="number" value={form.retentionMax} onChange={(e) => setForm({ ...form, retentionMax: e.target.value })} placeholder="keep N backups" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESET_CODONS.map((p: any) => (
            <button key={p.label} onClick={() => applyPreset(p)} className="px-2 py-1 text-xs rounded bg-surface-2 border border-border text-muted-foreground hover:text-foreground">
              {p.label} ({p.retention})
            </button>
          ))}
          <button onClick={() => create.mutate()} disabled={!form.name || create.isPending} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 ml-auto">
            {create.isPending ? 'Creating…' : 'Create strategy'}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-surface-2">Active strategies</div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Name</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Type</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Targets</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Storage</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Cron</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Keep</th>
            <th className="text-left text-xs text-muted-foreground px-4 py-2">Last run</th>
            <th className="text-right text-xs text-muted-foreground px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {strategies.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-6">No strategies yet</td></tr>}
            {strategies.map((s) => (
              <tr key={s.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 text-foreground">{s.name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{s.targetType}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground font-mono truncate max-w-xs">{(s.targets ?? []).join(', ')}</td>
                <td className="px-4 py-2 text-xs"><span className={`px-1.5 py-0.5 rounded ${s.storage === 's3' ? 'bg-info/10 text-info' : 'bg-surface-2 text-muted-foreground'}`}>{s.storage}</span></td>
                <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{s.scheduleCron}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{s.retentionMax}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{s.lastRanAt ? new Date(s.lastRanAt).toLocaleString() : '–'}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })} className={`px-2 py-0.5 text-xs rounded mr-1 ${s.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {s.enabled ? 'on' : 'off'}
                  </button>
                  <button onClick={() => remove.mutate(s.id)} className="px-2 py-0.5 text-xs rounded bg-error/10 text-error hover:bg-error/20">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {apps.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-3 text-xs text-muted-foreground">
          Tip: for <b>Applications</b> targets use pm2 names ({apps.slice(0, 3).map((a) => a.pm2Name).join(', ')}…). Each app backup embeds its DB dump (if dbType/dbName set) and excludes node_modules/.next/dist.
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Full backup section for server migration
// ───────────────────────────────────────────────────────────────────
function FullBackupSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    includeApps: true,
    includeDatabases: true,
    includeSshKeys: true,
    includeEnvVars: true,
    includeDockerConfigs: true,
    storage: 'local' as 'local' | 's3',
    s3ConfigId: '',
  });
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['full-backups'],
    queryFn: () => apiClient.get('/backups/full').then((r) => r.data as any[]),
  });

  const { data: s3configs = [] } = useQuery({
    queryKey: ['s3-configs'],
    queryFn: () => apiClient.get('/backups/s3').then((r) => r.data as any[]),
  });

  const { data: apps = [] } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get('/applications').then((r) => r.data as any[]),
  });

  const { data: databases = [] } = useQuery({
    queryKey: ['docker-databases'],
    queryFn: () => apiClient.get('/docker/db/databases').then((r) => r.data as any[]),
  });

  const runBackup = useMutation({
    mutationFn: () => apiClient.post('/backups/full', {
      name: form.name || undefined,
      includeApps: form.includeApps,
      includeDatabases: form.includeDatabases,
      includeSshKeys: form.includeSshKeys,
      includeEnvVars: form.includeEnvVars,
      includeDockerConfigs: form.includeDockerConfigs,
      storage: form.storage,
      s3ConfigId: form.storage === 's3' ? form.s3ConfigId : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['full-backups'] });
      setForm({ name: '', includeApps: true, includeDatabases: true, includeSshKeys: true, includeEnvVars: true, includeDockerConfigs: true, storage: 'local', s3ConfigId: '' });
    },
  });

  const restoreBackup = useMutation({
    mutationFn: (id: string) => apiClient.post(`/backups/full/${id}/restore`, { overwrite: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['full-backups'] });
      setRestoreConfirm(null);
    },
  });

  const deleteBackup = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/backups/full/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['full-backups'] }),
  });

  const downloadBackup = useMutation({
    mutationFn: (id: string) => apiClient.get(`/backups/full/${id}/download`, { responseType: 'blob' }),
  });

  const totalBackedUpApps = backups.reduce((acc, b) => acc + (b.includedApps?.length || 0), 0);
  const totalBackedUpDbs = backups.reduce((acc, b) => acc + (b.includedDatabases?.length || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Create Full Backup</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Backup everything needed to restore this server on a new machine. Includes SSH keys, environment variables, Docker configs, all applications and databases.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Backup name (optional)</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., production-backup-july-2026"
                className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Include in backup:</label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.includeApps}
                  onChange={(e) => setForm({ ...form, includeApps: e.target.checked })}
                  className="rounded border-border"
                />
                Applications ({apps.length} apps)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.includeDatabases}
                  onChange={(e) => setForm({ ...form, includeDatabases: e.target.checked })}
                  className="rounded border-border"
                />
                Databases ({databases.length} containers)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.includeSshKeys}
                  onChange={(e) => setForm({ ...form, includeSshKeys: e.target.checked })}
                  className="rounded border-border"
                />
                SSH keys & authorized_keys
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.includeEnvVars}
                  onChange={(e) => setForm({ ...form, includeEnvVars: e.target.checked })}
                  className="rounded border-border"
                />
                Environment variables (HAMYAR_*)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.includeDockerConfigs}
                  onChange={(e) => setForm({ ...form, includeDockerConfigs: e.target.checked })}
                  className="rounded border-border"
                />
                Docker configurations & compose files
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Storage destination</label>
              <select
                value={form.storage}
                onChange={(e) => setForm({ ...form, storage: e.target.value as 'local' | 's3' })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border"
              >
                <option value="local">Local (/var/backups)</option>
                <option value="s3">S3-compatible storage</option>
              </select>
            </div>

            {form.storage === 's3' && (
              <div>
                <label className="text-xs text-muted-foreground">S3 endpoint</label>
                <select
                  value={form.s3ConfigId}
                  onChange={(e) => setForm({ ...form, s3ConfigId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border"
                >
                  <option value="">— select S3 endpoint —</option>
                  {s3configs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
              <p className="text-xs text-warning font-medium">Migration Use Case</p>
              <p className="text-xs text-muted-foreground mt-1">
                Download this backup file, install hamyar-ops on a new server, then upload and restore to automatically configure all services, SSH keys, and applications.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            onClick={() => runBackup.mutate()}
            disabled={runBackup.isPending || (form.storage === 's3' && !form.s3ConfigId)}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {runBackup.isPending ? 'Creating backup...' : 'Create Full Backup'}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Full Backups</h3>
            <p className="text-xs text-muted-foreground">
              {backups.length} backup(s) • {totalBackedUpApps} apps • {totalBackedUpDbs} databases backed up
            </p>
          </div>
        </div>

        {isLoading && <div className="p-8 text-center text-muted-foreground">Loading...</div>}

        {!isLoading && backups.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No full backups yet. Create your first backup above.
          </div>
        )}

        {backups.map((backup) => (
          <div key={backup.id} className="border-b border-border/50 last:border-0">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{backup.name || 'Unnamed backup'}</p>
                  <span className={`px-1.5 py-0.5 text-xs rounded ${
                    backup.status === 'SUCCESS' ? 'bg-success/10 text-success' :
                    backup.status === 'FAILED' ? 'bg-error/10 text-error' :
                    'bg-warning/10 text-warning'
                  }`}>
                    {backup.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(backup.createdAt).toLocaleString()} • {formatBytes(backup.sizeBytes)}
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {backup.includedApps?.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">{backup.includedApps.length} apps</span>
                  )}
                  {backup.includedDatabases?.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-info/10 text-info">{backup.includedDatabases.length} databases</span>
                  )}
                  {backup.sshKeys && <span className="text-xs px-1.5 py-0.5 rounded bg-success/10 text-success">SSH</span>}
                  {backup.environmentVariables && <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">ENV</span>}
                  {backup.dockerConfigs && <span className="text-xs px-1.5 py-0.5 rounded bg-error/10 text-error">Docker</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {restoreConfirm === backup.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-error">Confirm restore?</span>
                    <button
                      onClick={() => restoreBackup.mutate(backup.id)}
                      disabled={restoreBackup.isPending}
                      className="px-2 py-1 text-xs bg-error text-error-foreground rounded hover:bg-error/90 disabled:opacity-50"
                    >
                      {restoreBackup.isPending ? 'Restoring...' : 'Yes, Restore'}
                    </button>
                    <button
                      onClick={() => setRestoreConfirm(null)}
                      className="px-2 py-1 text-xs bg-surface-2 text-muted-foreground rounded hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `/api/backups/full/${backup.id}/download`;
                        link.download = `full-backup-${backup.name || 'backup'}.tar.gz`;
                        link.click();
                      }}
                      className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => setRestoreConfirm(backup.id)}
                      className="px-2 py-1 text-xs bg-warning/10 text-warning rounded hover:bg-warning/20"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this backup?')) deleteBackup.mutate(backup.id);
                      }}
                      className="px-2 py-1 text-xs text-muted-foreground hover:text-error"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function FeaturesCustomizerSection() {
  const { features, toggleFeature, setAll, resetDefaults } = useFeatureToggleStore();

  const featureLabels: Record<string, string> = {
    applications: 'Applications Manager',
    microservices: 'Microservices & Logs',
    env: 'Environment Variables',
    pm2: 'PM2 Process Manager',
    docker: 'Docker Containers & Images',
    nginx: 'Nginx Virtual Hosts & Proxy',
    postgres: 'PostgreSQL Manager',
    redis: 'Redis Manager',
    rabbitmq: 'RabbitMQ Message Broker',
    servers: 'Servers & Load Balancer',
    terminal: 'Web Terminal Shell',
    files: 'File Manager & Code Editor',
    firewall: 'Firewall (UFW / iptables)',
    nameserver: 'Nameserver & DNS',
    sshAccess: 'SSH Key Access',
    terraform: 'Terraform Automation',
    ansible: 'Ansible Playbooks',
    pipelines: 'CI/CD Pipelines',
    registry: 'Docker Registry',
    github: 'GitHub Integrations',
    cron: 'Cron Jobs & Presets',
    supervisor: 'Supervisor Process Control',
    monitoring: 'System Monitoring',
    logs: 'System Logs',
    events: 'Events & Audit Trail',
    loadTesting: 'Load Testing Tools',
    status: 'System Status Page',
    backups: 'Backup & Restore',
    secrets: 'Secrets Manager',
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Menu & Features Customizer</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enable or disable sections to streamline your dashboard layout. Disabled features are hidden from the sidebar menu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton size="sm" variant="outline" onClick={() => setAll(true)}>Enable All</CustomButton>
          <CustomButton size="sm" variant="outline" onClick={resetDefaults}>Reset Defaults</CustomButton>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Object.keys(features).map((key) => {
          const k = key as keyof typeof features;
          return (
            <div key={key} className="p-3 bg-surface-2 border border-border rounded-lg flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{featureLabels[key] || key}</span>
              <CustomSwitch
                checked={features[k]}
                onChange={() => toggleFeature(k)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}


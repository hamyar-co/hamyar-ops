'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { ManagedServerDto, UserSshKeyDto } from '@hamyar-ops/shared';

// ─── Add Key Modal ────────────────────────────────────────────────────────────

function AddKeyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [error, setError] = useState('');

  const addKey = useMutation({
    mutationFn: () => apiClient.post('/ssh-access/keys', { name, publicKey: publicKey.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-ssh-keys'] });
      onClose();
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to add key'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg space-y-4 mx-4">
        <h2 className="text-lg font-semibold text-foreground">Add SSH Key</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Key Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. MacBook Pro"
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Public Key</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              rows={5}
              placeholder="ssh-rsa AAAA... user@host"
              className="w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-lg focus:outline-none focus:border-primary resize-none"
            />
          </div>
        </div>

        {error && <p className="text-xs text-error">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground border border-border"
          >
            Cancel
          </button>
          <button
            onClick={() => addKey.mutate()}
            disabled={!name.trim() || !publicKey.trim() || addKey.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
          >
            {addKey.isPending ? 'Adding...' : 'Add Key'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Key Row with server push status ─────────────────────────────────────────

function KeyRow({ keyData, servers }: { keyData: UserSshKeyDto; servers: ManagedServerDto[] }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [checkedServers, setCheckedServers] = useState<Set<string>>(new Set());

  const deleteKey = useMutation({
    mutationFn: () => apiClient.delete(`/ssh-access/keys/${keyData.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-ssh-keys'] }),
  });

  const pushKeys = useMutation({
    mutationFn: (serverIds: string[]) =>
      Promise.all(serverIds.map((sid) => apiClient.post(`/ssh-access/keys/${keyData.id}/push/${sid}`))),
    onSuccess: () => {
      setCheckedServers(new Set());
      // Refresh status queries for each server
      servers.forEach((s) =>
        qc.invalidateQueries({ queryKey: ['key-status', keyData.id, s.id] }),
      );
    },
  });

  const toggleServer = (serverId: string) => {
    const next = new Set(checkedServers);
    if (next.has(serverId)) next.delete(serverId);
    else next.add(serverId);
    setCheckedServers(next);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-surface hover:bg-background/50">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{keyData.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">{keyData.fingerprint}</p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <span className="text-xs text-muted-foreground">
            {new Date(keyData.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
          >
            {expanded ? 'Hide Servers' : 'Push to Servers'}
          </button>
          <ConfirmDialog
            trigger={
              <button className="px-2 py-1 text-xs rounded bg-error/10 text-error hover:bg-error/20">
                Delete
              </button>
            }
            title="Delete SSH Key?"
            description={`Remove "${keyData.name}" from hamyar-ops. This does not remove it from any servers.`}
            confirmLabel="Delete"
            destructive
            onConfirm={() => deleteKey.mutate()}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-3 border-t border-border bg-background/30 space-y-3">
          <p className="text-xs text-muted-foreground">Select servers to push this key to:</p>
          <div className="space-y-2">
            {servers.map((server) => (
              <ServerPushRow
                key={server.id}
                server={server}
                keyId={keyData.id}
                checked={checkedServers.has(server.id)}
                onToggle={() => toggleServer(server.id)}
              />
            ))}
            {servers.length === 0 && (
              <p className="text-xs text-muted-foreground">No managed servers configured</p>
            )}
          </div>
          {checkedServers.size > 0 && (
            <button
              onClick={() => pushKeys.mutate([...checkedServers])}
              disabled={pushKeys.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
            >
              {pushKeys.isPending ? 'Pushing...' : `Push to ${checkedServers.size} server(s)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ServerPushRow({
  server,
  keyId,
  checked,
  onToggle,
}: {
  server: ManagedServerDto;
  keyId: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();

  const { data: status } = useQuery<{ present: boolean }>({
    queryKey: ['key-status', keyId, server.id],
    queryFn: () =>
      apiClient.get(`/ssh-access/keys/${keyId}/status/${server.id}`).then((r) => r.data),
    staleTime: 30_000,
  });

  const removeKey = useMutation({
    mutationFn: () => apiClient.delete(`/ssh-access/keys/${keyId}/push/${server.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['key-status', keyId, server.id] }),
  });

  return (
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="rounded border-border"
        id={`server-${server.id}-key-${keyId}`}
      />
      <label
        htmlFor={`server-${server.id}-key-${keyId}`}
        className="flex-1 text-sm text-foreground cursor-pointer"
      >
        {server.name}
        <span className="text-xs text-muted-foreground ml-2">{server.host}</span>
      </label>
      {status?.present ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-success font-medium">Pushed</span>
          <button
            onClick={() => removeKey.mutate()}
            disabled={removeKey.isPending}
            className="px-2 py-0.5 text-xs rounded bg-error/10 text-error hover:bg-error/20"
          >
            Remove
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Not pushed</span>
      )}
    </div>
  );
}

// ─── Password Auth Section ────────────────────────────────────────────────────

function PasswordAuthSection({ servers }: { servers: ManagedServerDto[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Server Password Login Control</h2>
        <p className="text-xs text-warning mt-1">
          Warning: Disabling password auth means you can only login with SSH keys. Make sure your key is pushed before disabling.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-4 text-muted-foreground font-medium">Server</th>
              <th className="pb-2 pr-4 text-muted-foreground font-medium">Status</th>
              <th className="pb-2 text-muted-foreground font-medium">Toggle</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <PasswordAuthRow key={server.id} server={server} />
            ))}
            {servers.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-muted-foreground text-xs">
                  No managed servers configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PasswordAuthRow({ server }: { server: ManagedServerDto }) {
  const qc = useQueryClient();

  const { data } = useQuery<{ serverId: string; enabled: boolean }>({
    queryKey: ['password-auth', server.id],
    queryFn: () =>
      apiClient.get(`/ssh-access/password-auth/${server.id}`).then((r) => r.data),
    staleTime: 60_000,
  });

  const toggleAuth = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.patch(`/ssh-access/password-auth/${server.id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['password-auth', server.id] }),
  });

  const enabled = data?.enabled ?? null;

  return (
    <tr className="border-b border-border/50 hover:bg-background/50">
      <td className="py-3 pr-4">
        <div>
          <p className="text-sm font-medium text-foreground">{server.name}</p>
          <p className="text-xs text-muted-foreground">{server.host}</p>
        </div>
      </td>
      <td className="py-3 pr-4">
        {enabled === null ? (
          <span className="text-xs text-muted-foreground">Loading...</span>
        ) : enabled ? (
          <span className="px-2 py-0.5 text-xs rounded-full bg-warning/20 text-warning border border-warning/30 font-medium">
            ENABLED
          </span>
        ) : (
          <span className="px-2 py-0.5 text-xs rounded-full bg-success/20 text-success border border-success/30 font-medium">
            DISABLED
          </span>
        )}
      </td>
      <td className="py-3">
        {enabled !== null && (
          <ConfirmDialog
            trigger={
              <button
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  enabled ? 'bg-warning/60' : 'bg-success/60'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            }
            title={enabled ? 'Disable Password Auth?' : 'Enable Password Auth?'}
            description={
              enabled
                ? `Disabling password auth on ${server.name}. Ensure SSH key access is working before proceeding.`
                : `Enabling password auth on ${server.name}.`
            }
            confirmLabel={enabled ? 'Disable' : 'Enable'}
            destructive={enabled}
            onConfirm={() => toggleAuth.mutate(!enabled)}
          />
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SshAccessPage() {
  const [showAddKey, setShowAddKey] = useState(false);

  const { data: myKeys = [], isLoading: keysLoading } = useQuery<UserSshKeyDto[]>({
    queryKey: ['my-ssh-keys'],
    queryFn: () => apiClient.get('/ssh-access/keys').then((r) => r.data),
  });

  const { data: dbServers = [] } = useQuery<ManagedServerDto[]>({
    queryKey: ['managed-servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data),
  });

  const servers = [{ id: 'self', name: 'Current Server (Ops)', host: 'localhost', port: 22 } as unknown as ManagedServerDto, ...dbServers];

  return (
    <div className="space-y-6 animate-fade-in">
      {showAddKey && <AddKeyModal onClose={() => setShowAddKey(false)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">SSH Access</h1>
      </div>

      {/* My SSH Keys section */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">My SSH Keys</h2>
          <button
            onClick={() => setShowAddKey(true)}
            className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
          >
            Add SSH Key
          </button>
        </div>

        {keysLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading keys...</div>
        ) : myKeys.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm mb-3">No SSH keys added yet</p>
            <button
              onClick={() => setShowAddKey(true)}
              className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
            >
              Add your first key
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {myKeys.map((key) => (
              <KeyRow key={key.id} keyData={key} servers={servers} />
            ))}
          </div>
        )}
      </div>

      {/* Password Authentication section */}
      <PasswordAuthSection servers={servers} />
    </div>
  );
}

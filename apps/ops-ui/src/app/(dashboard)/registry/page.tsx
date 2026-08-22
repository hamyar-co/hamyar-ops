'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type {
  ContainerRegistryDto,
  RegistryImageDto,
  BuildRequestDto,
  BuildRecordDto,
  CreateRegistryDto,
  RegistryType,
  BuildMode,
  BuildLogEvent,
  BuildDoneEvent,
} from '@hamyar-ops/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}
    >
      {children}
    </span>
  );
}

function typeColor(t: RegistryType | string): string {
  if (t === 'dockerhub') return 'bg-info/15 text-info border-info/30';
  if (t === 'ghcr') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  return 'bg-surface-2 text-muted-foreground border-border';
}

function buildStatusColor(s: string): string {
  if (s === 'SUCCESS') return 'text-success';
  if (s === 'FAILED') return 'text-error';
  if (s === 'RUNNING') return 'text-info';
  return 'text-muted-foreground';
}

function fmtBytes(n?: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Add Registry Modal ───────────────────────────────────────────────────────

const EMPTY_REG: CreateRegistryDto = {
  name: '',
  type: 'dockerhub',
  url: '',
  username: '',
  password: '',
};

function RegistryModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: ContainerRegistryDto | null;
  onClose: () => void;
  onSave: (dto: CreateRegistryDto) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateRegistryDto>(
    initial
      ? {
          name: initial.name,
          type: initial.type,
          url: initial.url ?? '',
          username: initial.username ?? '',
          password: '',
        }
      : { ...EMPTY_REG },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              type: initial.type,
              url: initial.url ?? '',
              username: initial.username ?? '',
              password: '',
            }
          : { ...EMPTY_REG },
      );
      setError('');
    }
  }, [open, initial]);

  const set = (k: keyof CreateRegistryDto, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSave({
        name: form.name,
        type: form.type,
        url: form.url || undefined,
        username: form.username || undefined,
        password: form.password || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-md mx-4 animate-fade-in">
        <h3 className="text-base font-semibold text-foreground mb-4">
          {initial ? 'Edit Registry' : 'Add Registry'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Name *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              placeholder="my-registry"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value as RegistryType)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              <option value="dockerhub">Docker Hub</option>
              <option value="ghcr">GitHub Container Registry</option>
              <option value="self-hosted">Self-hosted</option>
            </select>
          </div>
          {form.type === 'self-hosted' && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Registry URL
              </label>
              <input
                value={form.url ?? ''}
                onChange={(e) => set('url', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                placeholder="https://registry.example.com"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Username
            </label>
            <input
              value={form.username ?? ''}
              onChange={(e) => set('username', e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              placeholder="docker-username"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Password / Token
            </label>
            <input
              type="password"
              value={form.password ?? ''}
              onChange={(e) => set('password', e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              placeholder={initial ? 'Leave blank to keep current' : 'Access token or password'}
            />
          </div>

          {error && (
            <p className="text-xs text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Pull to Server Modal ─────────────────────────────────────────────────────

function PullModal({
  image,
  onClose,
}: {
  image: string;
  onClose: () => void;
}) {
  const [serverId, setServerId] = useState('');
  const [result, setResult] = useState<{
    ok: boolean;
    output: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: servers = [] } = useQuery({
    queryKey: ['servers-list'],
    queryFn: () =>
      apiClient.get('/multi-server/servers').then((r) => r.data as any[]),
  });

  const handlePull = async () => {
    if (!serverId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await apiClient.post('/registry/pull', {
        serverId,
        image,
      });
      setResult(res.data);
    } catch (err: any) {
      setResult({
        ok: false,
        output: err?.response?.data?.message ?? err.message ?? 'Failed',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-md mx-4 animate-fade-in space-y-4">
        <h3 className="text-base font-semibold text-foreground">
          Pull Image to Server
        </h3>
        <p className="text-xs font-mono text-muted-foreground bg-surface-2 rounded px-3 py-2">
          {image}
        </p>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Target Server
          </label>
          <select
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="">Select server…</option>
            <option value="self">Current Server (Ops)</option>
            {servers.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.host})
              </option>
            ))}
          </select>
        </div>

        {result && (
          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              result.ok
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-error/10 text-error border border-error/20'
            }`}
          >
            <p className="font-medium mb-1">
              {result.ok ? 'Pull successful' : 'Pull failed'}
            </p>
            {result.output && (
              <pre className="whitespace-pre-wrap font-mono opacity-80 text-xs">
                {result.output.slice(0, 500)}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-surface-2"
          >
            Close
          </button>
          <button
            onClick={handlePull}
            disabled={!serverId || loading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Pulling…' : 'Pull'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Registries Tab ───────────────────────────────────────────────────────────

function RegistriesTab() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ContainerRegistryDto | null>(
    null,
  );
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: registries = [], isLoading } = useQuery({
    queryKey: ['registries'],
    queryFn: () =>
      apiClient.get('/registry').then((r) => r.data as ContainerRegistryDto[]),
  });

  const createMut = useMutation({
    mutationFn: (dto: CreateRegistryDto) =>
      apiClient.post('/registry', dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateRegistryDto> }) =>
      apiClient.put(`/registry/${id}`, dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/registry/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
  });

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiClient.post(`/registry/${id}/test`);
      setTestResults((prev) => ({ ...prev, [id]: res.data }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: err?.response?.data?.message ?? 'Failed' },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {registries.length} registr{registries.length !== 1 ? 'ies' : 'y'}
        </p>
        <button
          onClick={() => {
            setEditTarget(null);
            setShowModal(true);
          }}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          + Add Registry
        </button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading…
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/50">
            <tr>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                Name
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                Type
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                URL / Host
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">
                Username
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {registries.map((r) => {
              const testResult = testResults[r.id];
              return (
                <tr
                  key={r.id}
                  className="hover:bg-surface-2/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.name}
                    {testResult && (
                      <span
                        className={`ml-2 text-xs ${testResult.ok ? 'text-success' : 'text-error'}`}
                      >
                        {testResult.ok ? '✓' : '✗'} {testResult.message}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={typeColor(r.type)}>{r.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell font-mono">
                    {r.url ?? (r.type === 'dockerhub' ? 'docker.io' : 'ghcr.io')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {r.username ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTest(r.id)}
                        disabled={testingId === r.id}
                        className="px-2 py-1 text-xs bg-surface-2 hover:bg-surface-3 border border-border rounded text-foreground disabled:opacity-40"
                      >
                        {testingId === r.id ? '…' : 'Test'}
                      </button>
                      <button
                        onClick={() => {
                          setEditTarget(r);
                          setShowModal(true);
                        }}
                        className="px-2 py-1 text-xs bg-surface-2 hover:bg-surface-3 border border-border rounded text-foreground"
                      >
                        Edit
                      </button>
                      <ConfirmDialog
                        trigger={
                          <button className="px-2 py-1 text-xs bg-error/10 hover:bg-error/20 border border-error/30 rounded text-error">
                            Delete
                          </button>
                        }
                        title="Delete Registry"
                        description={`Delete "${r.name}"?`}
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => void deleteMut.mutateAsync(r.id)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {registries.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No registries configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RegistryModal
        open={showModal}
        initial={editTarget}
        onClose={() => {
          setShowModal(false);
          setEditTarget(null);
        }}
        onSave={async (dto) => {
          if (editTarget) {
            await updateMut.mutateAsync({ id: editTarget.id, dto });
          } else {
            await createMut.mutateAsync(dto);
          }
        }}
      />
    </div>
  );
}

// ─── Images Tab ───────────────────────────────────────────────────────────────

function ImagesTab() {
  const [selectedRegId, setSelectedRegId] = useState('');
  const [pullTarget, setPullTarget] = useState<string | null>(null);

  const { data: registries = [] } = useQuery({
    queryKey: ['registries'],
    queryFn: () =>
      apiClient.get('/registry').then((r) => r.data as ContainerRegistryDto[]),
  });

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['registry-images', selectedRegId],
    queryFn: () =>
      apiClient
        .get(`/registry/${selectedRegId}/images`)
        .then((r) => r.data as RegistryImageDto[]),
    enabled: !!selectedRegId,
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Select Registry
        </label>
        <select
          value={selectedRegId}
          onChange={(e) => setSelectedRegId(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground w-64"
        >
          <option value="">Choose a registry…</option>
          {registries.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedRegId && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Select a registry to browse its images
        </p>
      )}

      {selectedRegId && isLoading && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading…
        </div>
      )}

      {selectedRegId && !isLoading && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/50">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Image
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Tag
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                  Size
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">
                  Last Pushed
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {images.map((img, i) => (
                <tr
                  key={`${img.name}:${img.tag}-${i}`}
                  className="hover:bg-surface-2/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-sm text-foreground">
                    {img.name}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="bg-surface-2 text-muted-foreground border-border font-mono">
                      {img.tag}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {fmtBytes(img.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                    {fmtDate(img.pushedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() =>
                        setPullTarget(`${img.name}:${img.tag}`)
                      }
                      className="px-2 py-1 text-xs bg-surface-2 hover:bg-surface-3 border border-border rounded text-foreground"
                    >
                      Pull to Server
                    </button>
                  </td>
                </tr>
              ))}
              {images.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No images found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pullTarget && (
        <PullModal image={pullTarget} onClose={() => setPullTarget(null)} />
      )}
    </div>
  );
}

// ─── Builds Tab ───────────────────────────────────────────────────────────────

const EMPTY_BUILD: BuildRequestDto = {
  appName: '',
  mode: 'ci',
  registryId: '',
  serverId: '',
  tag: '',
  contextPath: '',
  dockerfilePath: '',
};

function BuildsTab() {
  const { socket } = useSocket();
  const [form, setForm] = useState<BuildRequestDto>({ ...EMPTY_BUILD });
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [buildStatus, setBuildStatus] = useState<'idle' | 'running' | 'done'>(
    'idle',
  );
  const [buildError, setBuildError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const { data: registries = [] } = useQuery({
    queryKey: ['registries'],
    queryFn: () =>
      apiClient.get('/registry').then((r) => r.data as ContainerRegistryDto[]),
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['servers-list'],
    queryFn: () =>
      apiClient.get('/multi-server/servers').then((r) => r.data as any[]),
  });

  const { data: recentBuilds = [] } = useQuery({
    queryKey: ['registry-builds'],
    queryFn: () =>
      apiClient.get('/registry/builds').then((r) => r.data as BuildRecordDto[]),
    refetchInterval: activeBuildId ? 3_000 : 15_000,
  });

  const set = (k: keyof BuildRequestDto, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Socket: listen for build logs on active buildId
  useEffect(() => {
    if (!socket || !activeBuildId) return;
    const logHandler = (ev: BuildLogEvent) => {
      if (ev.buildId !== activeBuildId) return;
      setBuildLogs((prev) => [...prev, ev.line]);
      setTimeout(() => {
        logRef.current?.scrollTo({
          top: logRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 50);
    };
    const doneHandler = (ev: BuildDoneEvent) => {
      if (ev.buildId !== activeBuildId) return;
      setBuildStatus('done');
      setBuildLogs((prev) => [
        ...prev,
        `--- Build ${ev.status}${ev.tag ? ` (tag: ${ev.tag})` : ''} ---`,
      ]);
    };
    socket.on(WsEvents.BUILD_LOG, logHandler);
    socket.on(WsEvents.BUILD_DONE, doneHandler);
    return () => {
      socket.off(WsEvents.BUILD_LOG, logHandler);
      socket.off(WsEvents.BUILD_DONE, doneHandler);
    };
  }, [socket, activeBuildId]);

  const handleBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuildLogs([]);
    setBuildError('');
    setBuildStatus('running');
    try {
      const dto: BuildRequestDto = {
        appName: form.appName,
        mode: form.mode,
        registryId: form.registryId || undefined,
        serverId: form.mode === 'remote' ? form.serverId || undefined : undefined,
        tag: form.tag || undefined,
        contextPath: form.contextPath || undefined,
        dockerfilePath: form.dockerfilePath || undefined,
      };
      const res = await apiClient
        .post('/registry/build', dto)
        .then((r) => r.data as { buildId: string });
      setActiveBuildId(res.buildId);
    } catch (err: any) {
      setBuildError(err?.response?.data?.message ?? err.message ?? 'Failed');
      setBuildStatus('idle');
    }
  };

  return (
    <div className="space-y-6">
      {/* New Build form */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          New Build
        </h3>
        <form onSubmit={handleBuild} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                App Name *
              </label>
              <input
                required
                value={form.appName}
                onChange={(e) => set('appName', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                placeholder="my-app"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Image Tag
              </label>
              <input
                value={form.tag ?? ''}
                onChange={(e) => set('tag', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                placeholder="my-app:1.0.0"
              />
            </div>
          </div>

          {/* Build mode */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Build Mode
            </label>
            <div className="flex gap-3 flex-wrap">
              {(['ci', 'local', 'remote'] as BuildMode[]).map((m) => (
                <label
                  key={m}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    form.mode === m
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-surface-2 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={form.mode === m}
                    onChange={() => set('mode', m)}
                    className="sr-only"
                  />
                  <span>
                    {m === 'ci' && 'CI-recorded'}
                    {m === 'local' && 'Local build'}
                    {m === 'remote' && 'Remote build'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {form.mode === 'remote' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Build Server
                </label>
                <select
                  value={form.serverId ?? ''}
                  onChange={(e) => set('serverId', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select server…</option>
                  <option value="self">Current Server (Ops)</option>
                  {servers.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Registry (optional)
              </label>
              <select
                value={form.registryId ?? ''}
                onChange={(e) => set('registryId', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="">None (no push)</option>
                {registries.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            {form.mode !== 'ci' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Context Path
                </label>
                <input
                  value={form.contextPath ?? ''}
                  onChange={(e) => set('contextPath', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  placeholder="."
                />
              </div>
            )}
          </div>

          {buildError && (
            <p className="text-xs text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
              {buildError}
            </p>
          )}

          <button
            type="submit"
            disabled={buildStatus === 'running'}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {buildStatus === 'running' ? '⟳ Building…' : 'Start Build'}
          </button>
        </form>
      </div>

      {/* Live build log */}
      {(buildLogs.length > 0 || buildStatus === 'running') && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Build Output
            </h4>
            {buildStatus === 'running' && (
              <span className="text-xs text-info animate-pulse">Live</span>
            )}
            {buildStatus === 'done' && (
              <span className="text-xs text-success">Done</span>
            )}
          </div>
          <div
            ref={logRef}
            className="bg-[#0d0d0d] rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs text-green-400 space-y-0.5 scrollbar-thin scrollbar-thumb-border"
          >
            {buildLogs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
            {buildStatus === 'running' && buildLogs.length === 0 && (
              <div className="text-muted-foreground">Waiting for output…</div>
            )}
          </div>
        </div>
      )}

      {/* Recent builds */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Recent Builds
        </h3>
        {recentBuilds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No builds yet. Start a build above.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                    App
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                    Mode
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                    Tag
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">
                    Started
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {recentBuilds.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-surface-2/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {b.appName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="bg-surface-2 text-muted-foreground border-border">
                        {b.mode}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                      {b.tag ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${buildStatusColor(b.status)}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                      {fmtDate(b.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'registries' | 'images' | 'builds';

export default function RegistryPage() {
  const [tab, setTab] = useState<Tab>('registries');

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
          Container Registry
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage container registries, browse images, and trigger builds
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {(['registries', 'images', 'builds'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize whitespace-nowrap transition-colors -mb-px border-b-2 ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'registries' && <RegistriesTab />}
      {tab === 'images' && <ImagesTab />}
      {tab === 'builds' && <BuildsTab />}
    </div>
  );
}

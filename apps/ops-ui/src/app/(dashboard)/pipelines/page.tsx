'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type {
  PipelineDto,
  PipelineRunDto,
  PipelineStepDto,
  CreatePipelineDto,
  PipelineStatus,
  StepName,
  PipelineTrigger,
  PipelineStrategy,
  PipelineBuildMode,
  PipelineStepEvent,
} from '@hamyar-ops/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stepColor(status: PipelineStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-success/15 text-success border-success/30';
    case 'FAILED':
      return 'bg-error/15 text-error border-error/30';
    case 'RUNNING':
      return 'bg-info/15 text-info border-info/30';
    default:
      return 'bg-muted/40 text-muted-foreground border-border';
  }
}

function stepIcon(status: PipelineStatus): string {
  switch (status) {
    case 'SUCCESS':
      return '✓';
    case 'FAILED':
      return '✗';
    case 'RUNNING':
      return '⟳';
    default:
      return '·';
  }
}

function strategyColor(s: PipelineStrategy | string): string {
  if (s === 'rolling') return 'bg-info/15 text-info border-info/30';
  if (s === 'blue-green') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  return 'bg-success/15 text-success border-success/30';
}

function triggerColor(t: PipelineTrigger | string): string {
  if (t === 'webhook') return 'bg-warning/15 text-warning border-warning/30';
  if (t === 'schedule') return 'bg-info/15 text-info border-info/30';
  return 'bg-muted/40 text-muted-foreground border-border';
}

function runStatusColor(s: PipelineStatus): string {
  if (s === 'SUCCESS') return 'text-success';
  if (s === 'FAILED') return 'text-error';
  if (s === 'RUNNING') return 'text-info';
  return 'text-muted-foreground';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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

// ─── Step timeline ────────────────────────────────────────────────────────────

function StepTimeline({
  steps,
  liveSteps,
}: {
  steps: PipelineStepDto[];
  liveSteps?: Record<string, PipelineStatus>;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => {
        const status = liveSteps?.[step.id] ?? (step.status as PipelineStatus);
        return (
          <div key={step.id} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${stepColor(status)}`}
            >
              <span>{stepIcon(status)}</span>
              <span>{step.name}</span>
            </span>
            {i < steps.length - 1 && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Create Pipeline Modal ────────────────────────────────────────────────────

const EMPTY_FORM: CreatePipelineDto = {
  name: '',
  appName: '',
  serverId: '',
  trigger: 'manual',
  cron: '',
  strategy: 'rolling',
  buildMode: 'ci',
  registryId: '',
  imageTag: '',
  enabled: true,
};

function CreatePipelineModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (dto: CreatePipelineDto) => Promise<PipelineDto>;
}) {
  const [form, setForm] = useState<CreatePipelineDto>({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdWebhookUrl, setCreatedWebhookUrl] = useState<string | null>(null);

  const { data: servers = [] } = useQuery({
    queryKey: ['servers-list'],
    queryFn: () =>
      apiClient.get('/multi-server/servers').then((r) => r.data as any[]),
  });

  const { data: registries = [] } = useQuery({
    queryKey: ['registries-list'],
    queryFn: () =>
      apiClient.get('/registry').then((r) => r.data as any[]),
  });

  const set = (k: keyof CreatePipelineDto, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const dto: CreatePipelineDto = {
        name: form.name,
        appName: form.appName || undefined,
        serverId: form.serverId || undefined,
        trigger: form.trigger,
        cron: form.trigger === 'schedule' ? form.cron || undefined : undefined,
        strategy: form.strategy,
        buildMode: form.buildMode,
        registryId: form.registryId || undefined,
        imageTag: form.imageTag || undefined,
        enabled: form.enabled,
      };
      const result = await onCreate(dto);
      if (result.webhookUrl) {
        setCreatedWebhookUrl(result.webhookUrl);
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  if (createdWebhookUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 animate-fade-in space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            Pipeline Created — Webhook URL
          </h3>
          <p className="text-sm text-muted-foreground">
            Copy this URL and set it as your webhook endpoint. It will not be
            shown again.
          </p>
          <input
            readOnly
            value={createdWebhookUrl}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground select-all"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 animate-fade-in">
        <h3 className="text-base font-semibold text-foreground mb-4">
          New Pipeline
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">
                Name *
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                placeholder="my-pipeline"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                App Name
              </label>
              <input
                value={form.appName ?? ''}
                onChange={(e) => set('appName', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                placeholder="my-app"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Server
              </label>
              <select
                value={form.serverId ?? ''}
                onChange={(e) => set('serverId', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="">None</option>
                <option value="self">Current Server (Ops)</option>
                {servers.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Strategy
              </label>
              <select
                value={form.strategy}
                onChange={(e) =>
                  set('strategy', e.target.value as PipelineStrategy)
                }
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="rolling">Rolling</option>
                <option value="blue-green">Blue-Green</option>
                <option value="restart">Restart</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Build Mode
              </label>
              <select
                value={form.buildMode}
                onChange={(e) =>
                  set('buildMode', e.target.value as PipelineBuildMode)
                }
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="ci">CI (no build)</option>
                <option value="local">Local build</option>
                <option value="remote">Remote build</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Trigger
              </label>
              <select
                value={form.trigger}
                onChange={(e) =>
                  set('trigger', e.target.value as PipelineTrigger)
                }
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="manual">Manual</option>
                <option value="webhook">Webhook</option>
                <option value="schedule">Schedule</option>
              </select>
            </div>
            {form.trigger === 'schedule' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Cron Expression
                </label>
                <input
                  value={form.cron ?? ''}
                  onChange={(e) => set('cron', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  placeholder="0 2 * * *"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Registry
              </label>
              <select
                value={form.registryId ?? ''}
                onChange={(e) => set('registryId', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="">None</option>
                {registries.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Image Tag
              </label>
              <input
                value={form.imageTag ?? ''}
                onChange={(e) => set('imageTag', e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                placeholder="myrepo/myapp:latest"
              />
            </div>
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
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Pipelines Tab ────────────────────────────────────────────────────────────

function PipelinesTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () =>
      apiClient.get('/pipelines').then((r) => r.data as PipelineDto[]),
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (dto: CreatePipelineDto) =>
      apiClient.post('/pipelines', dto).then((r) => r.data as PipelineDto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  const triggerMut = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/pipelines/${id}/trigger`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      qc.invalidateQueries({ queryKey: ['pipeline-runs'] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.patch(`/pipelines/${id}/toggle`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/pipelines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          + New Pipeline
        </button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading…
        </div>
      )}

      <div className="space-y-3">
        {pipelines.map((p) => (
          <div
            key={p.id}
            className="bg-surface border border-border rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground truncate">
                    {p.name}
                  </span>
                  {p.appName && (
                    <Badge className="bg-surface-2 text-foreground border-border">
                      {p.appName}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={strategyColor(p.strategy)}>
                    {p.strategy}
                  </Badge>
                  <Badge className={triggerColor(p.trigger)}>
                    {p.trigger}
                  </Badge>
                  <Badge className="bg-surface-2 text-muted-foreground border-border">
                    {p.buildMode}
                  </Badge>
                  {p.lastRun && (
                    <span
                      className={`text-xs ${runStatusColor(p.lastRun.status)}`}
                    >
                      last: {p.lastRun.status} {fmtDate(p.lastRun.startedAt)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Enabled toggle */}
                <button
                  onClick={() =>
                    toggleMut.mutate({ id: p.id, enabled: !p.enabled })
                  }
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    p.enabled ? 'bg-success' : 'bg-muted'
                  }`}
                  title={p.enabled ? 'Enabled' : 'Disabled'}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-foreground transition-transform ${
                      p.enabled ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>

                <button
                  onClick={() => triggerMut.mutate(p.id)}
                  disabled={!p.enabled || triggerMut.isPending}
                  className="px-3 py-1 text-xs bg-surface-2 hover:bg-surface-3 border border-border rounded-lg text-foreground disabled:opacity-40"
                >
                  ▶ Run
                </button>

                <ConfirmDialog
                  trigger={
                    <button className="px-3 py-1 text-xs bg-error/10 hover:bg-error/20 border border-error/30 rounded-lg text-error">
                      Delete
                    </button>
                  }
                  title="Delete Pipeline"
                  description={`Delete "${p.name}"? This will remove all runs and history.`}
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => void deleteMut.mutateAsync(p.id)}
                />
              </div>
            </div>

            {p.lastRun && p.lastRun.steps.length > 0 && (
              <StepTimeline steps={p.lastRun.steps} />
            )}
          </div>
        ))}
      </div>

      <CreatePipelineModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={createMut.mutateAsync}
      />
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────────────────────

function RunsTab() {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  // live step status overrides: runId → stepId → status
  const [liveSteps, setLiveSteps] = useState<
    Record<string, Record<string, PipelineStatus>>
  >({});

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () =>
      apiClient.get('/pipelines').then((r) => r.data as PipelineDto[]),
  });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['pipeline-runs', selectedPipelineId],
    queryFn: () =>
      apiClient
        .get(`/pipelines/${selectedPipelineId}/runs`)
        .then((r) => r.data as PipelineRunDto[]),
    enabled: !!selectedPipelineId,
    refetchInterval: 10_000,
  });

  const rollbackMut = useMutation({
    mutationFn: (runId: string) =>
      apiClient.post(`/pipelines/runs/${runId}/rollback`, {}),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['pipeline-runs', selectedPipelineId],
      }),
  });

  // Real-time step updates
  useEffect(() => {
    if (!socket) return;
    const handler = (ev: PipelineStepEvent) => {
      setLiveSteps((prev) => ({
        ...prev,
        [ev.runId]: {
          ...(prev[ev.runId] ?? {}),
          [ev.stepId]: ev.status,
        },
      }));
      // Also invalidate so on next poll we get fresh data
      qc.invalidateQueries({
        queryKey: ['pipeline-runs', selectedPipelineId],
      });
    };
    socket.on(WsEvents.PIPELINE_STEP, handler);
    socket.on(WsEvents.PIPELINE_DONE, () => {
      qc.invalidateQueries({
        queryKey: ['pipeline-runs', selectedPipelineId],
      });
    });
    return () => {
      socket.off(WsEvents.PIPELINE_STEP, handler);
      socket.off(WsEvents.PIPELINE_DONE);
    };
  }, [socket, selectedPipelineId, qc]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Select Pipeline
        </label>
        <select
          value={selectedPipelineId}
          onChange={(e) => setSelectedPipelineId(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground w-64"
        >
          <option value="">Choose a pipeline…</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedPipelineId && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Select a pipeline to view its runs
        </p>
      )}

      {selectedPipelineId && isLoading && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading…
        </div>
      )}

      <div className="space-y-3">
        {runs.map((run) => {
          const runLive = liveSteps[run.id] ?? {};
          const isRunning = run.status === 'RUNNING';
          return (
            <div
              key={run.id}
              className="bg-surface border border-border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${runStatusColor(run.status as PipelineStatus)}`}
                    >
                      {isRunning ? '⟳ ' : ''}
                      {run.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {run.trigger}
                    </span>
                    {run.branch && (
                      <Badge className="bg-surface-2 text-muted-foreground border-border">
                        {run.branch}
                      </Badge>
                    )}
                    {run.commitSha && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {run.commitSha.slice(0, 7)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(run.startedAt)}
                    {run.finishedAt && ` → ${fmtDate(run.finishedAt)}`}
                  </p>
                </div>

                {run.status === 'FAILED' && (
                  <ConfirmDialog
                    trigger={
                      <button className="px-3 py-1 text-xs bg-warning/10 hover:bg-warning/20 border border-warning/30 rounded-lg text-warning shrink-0">
                        Rollback
                      </button>
                    }
                    title="Rollback Run"
                    description="This will trigger a rollback run restoring the previous successful deployment."
                    confirmLabel="Rollback"
                    onConfirm={() => void rollbackMut.mutateAsync(run.id)}
                  />
                )}
              </div>

              <StepTimeline steps={run.steps} liveSteps={runLive} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () =>
      apiClient.get('/pipelines').then((r) => r.data as PipelineDto[]),
  });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-2/50">
          <tr>
            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
              Pipeline
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
              App
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
              Last Run
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
              Status
            </th>
            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">
              Steps
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {pipelines.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2/30 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground">
                {p.name}
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                {p.appName ?? '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {p.lastRun ? fmtDate(p.lastRun.startedAt) : '—'}
              </td>
              <td className="px-4 py-3">
                {p.lastRun ? (
                  <span
                    className={`text-xs font-medium ${runStatusColor(p.lastRun.status as PipelineStatus)}`}
                  >
                    {p.lastRun.status}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No runs</span>
                )}
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                {p.lastRun ? (
                  <StepTimeline steps={p.lastRun.steps} />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
          {pipelines.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No pipelines found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'pipelines' | 'runs' | 'history';

export default function PipelinesPage() {
  const [tab, setTab] = useState<Tab>('pipelines');

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
          Pipelines
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage CI/CD pipelines, deployments, and build runs
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {(['pipelines', 'runs', 'history'] as Tab[]).map((t) => (
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

      {tab === 'pipelines' && <PipelinesTab />}
      {tab === 'runs' && <RunsTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

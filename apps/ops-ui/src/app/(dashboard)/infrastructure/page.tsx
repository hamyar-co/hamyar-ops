'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import type {
  TerraformWorkspaceDto,
  TerraformRunDto,
  TerraformModuleTemplate,
  CreateTerraformWorkspaceDto,
  TerraformLogEvent,
  TerraformDoneEvent,
} from '@hamyar-ops/shared';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Card, Grid, ResponsiveTable } from '@/components/layout/ResponsiveComponents';

type Tab = 'workspaces' | 'runs' | 'templates';

// ─── Status badge variants ────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SUCCESS: 'bg-success/15 text-success border-success/20',
    FAILED: 'bg-error/15 text-error border-error/20',
    RUNNING: 'bg-info/15 text-info border-info/20',
    PENDING: 'bg-muted/50 text-muted-foreground border-border',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? 'bg-muted/50 text-muted-foreground border-border'}`}>
      {status.toLowerCase()}
    </span>
  );
}

function CommandBadge({ command }: { command: string }) {
  const colors: Record<string, string> = {
    init: 'bg-info/15 text-info border-info/20',
    plan: 'bg-accent/15 text-accent border-accent/20',
    apply: 'bg-success/15 text-success border-success/20',
    destroy: 'bg-error/15 text-error border-error/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[command] ?? 'bg-muted/50 text-muted-foreground border-border'}`}>
      {command}
    </span>
  );
}

function PlanSummaryBadges({ summary }: { summary: { add: number; change: number; destroy: number } | null }) {
  if (!summary) return null;
  return (
    <span className="flex items-center gap-1">
      {summary.add > 0 && (
        <span className="text-xs font-mono text-success">+{summary.add}</span>
      )}
      {summary.change > 0 && (
        <span className="text-xs font-mono text-warning">~{summary.change}</span>
      )}
      {summary.destroy > 0 && (
        <span className="text-xs font-mono text-error">-{summary.destroy}</span>
      )}
    </span>
  );
}

function BackendBadge({ backend }: { backend: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
      backend === 's3'
        ? 'bg-accent/15 text-accent border-accent/20'
        : 'bg-muted/50 text-muted-foreground border-border'
    }`}>
      {backend}
    </span>
  );
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ─── New Workspace Modal ──────────────────────────────────────────────────────

interface NewWorkspaceModalProps {
  templates: TerraformModuleTemplate[];
  initialTemplate?: TerraformModuleTemplate | null;
  onClose: () => void;
  onCreated: () => void;
}

function NewWorkspaceModal({ templates, initialTemplate, onClose, onCreated }: NewWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TerraformModuleTemplate | null>(initialTemplate ?? null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [stateBackend, setStateBackend] = useState<'local' | 's3'>('local');
  const [s3ConfigId, setS3ConfigId] = useState('');
  const [error, setError] = useState('');

  const { data: s3Configs } = useQuery({
    queryKey: ['s3-configs'],
    queryFn: () => apiClient.get('/backups/s3').then((r) => r.data as { id: string; name: string }[]),
    enabled: stateBackend === 's3',
  });

  const create = useMutation({
    mutationFn: (dto: CreateTerraformWorkspaceDto) =>
      apiClient.post('/terraform/workspaces', dto).then((r) => r.data),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to create workspace'),
  });

  const handleTemplateSelect = (t: TerraformModuleTemplate | null) => {
    setSelectedTemplate(t);
    setTemplateVars({});
  };

  const handleVarChange = (varName: string, value: string) => {
    setTemplateVars((prev) => ({ ...prev, [varName]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    const dto: CreateTerraformWorkspaceDto = {
      name: name.trim(),
      description: description.trim() || undefined,
      stateBackend,
      s3ConfigId: stateBackend === 's3' && s3ConfigId ? s3ConfigId : undefined,
      templateKey: selectedTemplate?.key as CreateTerraformWorkspaceDto['templateKey'],
      templateVars: selectedTemplate ? templateVars : undefined,
    };
    create.mutate(dto);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">New Workspace</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-infra"
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Template picker */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Template (optional)</label>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2 p-2 border border-border rounded cursor-pointer hover:bg-surface-2">
                <input
                  type="radio"
                  name="template"
                  checked={!selectedTemplate}
                  onChange={() => handleTemplateSelect(null)}
                  className="accent-primary"
                />
                <span className="text-sm text-foreground">Blank workspace</span>
              </label>
              {templates.map((t) => (
                <label
                  key={t.key}
                  className={`flex items-start gap-2 p-2 border rounded cursor-pointer hover:bg-surface-2 ${
                    selectedTemplate?.key === t.key ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    checked={selectedTemplate?.key === t.key}
                    onChange={() => handleTemplateSelect(t)}
                    className="accent-primary mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Template variables */}
          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Template Variables</label>
              <div className="space-y-2">
                {selectedTemplate.variables.map((v) => (
                  <div key={v.name}>
                    <label className="block text-xs text-muted-foreground mb-0.5">
                      {v.name}
                      {v.required && <span className="text-error ml-1">*</span>}
                      <span className="ml-1 text-muted-foreground/60">— {v.description}</span>
                    </label>
                    <input
                      value={templateVars[v.name] ?? ''}
                      onChange={(e) => handleVarChange(v.name, e.target.value)}
                      placeholder={v.default ?? v.name}
                      className="w-full px-3 py-1.5 text-sm bg-surface-2 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* State backend */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">State Backend</label>
            <div className="flex gap-3">
              {(['local', 's3'] as const).map((b) => (
                <label key={b} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="backend"
                    checked={stateBackend === b}
                    onChange={() => setStateBackend(b)}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground capitalize">{b}</span>
                </label>
              ))}
            </div>
          </div>

          {/* S3 config picker */}
          {stateBackend === 's3' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">S3 Configuration</label>
              <select
                value={s3ConfigId}
                onChange={(e) => setS3ConfigId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                <option value="">Select S3 config…</option>
                {(s3Configs ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InfrastructurePage() {
  const [tab, setTab] = useState<Tab>('workspaces');
  const [showNewModal, setShowNewModal] = useState(false);
  const [prefilledTemplate, setPrefilledTemplate] = useState<TerraformModuleTemplate | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [liveOutput, setLiveOutput] = useState<Record<string, string[]>>({});
  const { socket } = useSocket();
  const qc = useQueryClient();

  const { data: workspaces, isLoading: wsLoading } = useQuery({
    queryKey: ['terraform-workspaces'],
    queryFn: () => apiClient.get('/terraform/workspaces').then((r) => r.data as TerraformWorkspaceDto[]),
  });

  const { data: templates } = useQuery({
    queryKey: ['terraform-templates'],
    queryFn: () => apiClient.get('/terraform/templates').then((r) => r.data as TerraformModuleTemplate[]),
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['terraform-runs', selectedWorkspaceId],
    queryFn: () =>
      apiClient.get(`/terraform/workspaces/${selectedWorkspaceId}/runs`).then((r) => r.data as TerraformRunDto[]),
    enabled: !!selectedWorkspaceId,
  });

  // socket: live TF_LOG and TF_DONE
  useEffect(() => {
    if (!socket) return;

    socket.on(WsEvents.TF_LOG, (event: TerraformLogEvent) => {
      setLiveOutput((prev) => ({
        ...prev,
        [event.runId]: [...(prev[event.runId] ?? []), event.line],
      }));
    });

    socket.on(WsEvents.TF_DONE, (_event: TerraformDoneEvent) => {
      qc.invalidateQueries({ queryKey: ['terraform-runs'] });
      qc.invalidateQueries({ queryKey: ['terraform-workspaces'] });
    });

    return () => {
      socket.off(WsEvents.TF_LOG);
      socket.off(WsEvents.TF_DONE);
    };
  }, [socket, qc]);

  const runCommand = useMutation({
    mutationFn: ({ workspaceId, command }: { workspaceId: string; command: string }) =>
      apiClient.post(`/terraform/workspaces/${workspaceId}/run`, { command }).then((r) => r.data as TerraformRunDto),
    onSuccess: (run) => {
      setLiveOutput((prev) => ({ ...prev, [run.id]: [] }));
      setExpandedRunId(run.id);
      setSelectedWorkspaceId(run.workspaceId);
      setTab('runs');
      qc.invalidateQueries({ queryKey: ['terraform-runs', run.workspaceId] });
      qc.invalidateQueries({ queryKey: ['terraform-workspaces'] });
    },
  });

  const deleteWorkspace = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/terraform/workspaces/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terraform-workspaces'] }),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'workspaces', label: 'Workspaces' },
    { key: 'runs', label: 'Runs' },
    { key: 'templates', label: 'Module Library' },
  ];

  const handleUseTemplate = (t: TerraformModuleTemplate) => {
    setPrefilledTemplate(t);
    setShowNewModal(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Infrastructure</h1>
        <button
          onClick={() => { setPrefilledTemplate(null); setShowNewModal(true); }}
          className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
        >
          + New Workspace
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors -mb-px border-b-2 ${
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Workspaces tab ── */}
      {tab === 'workspaces' && (
        <Card>
          {wsLoading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : !workspaces?.length ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No workspaces yet.</p>
              <button
                onClick={() => { setPrefilledTemplate(null); setShowNewModal(true); }}
                className="mt-3 text-sm text-primary hover:underline"
              >
                Create your first workspace
              </button>
            </div>
          ) : (
            <ResponsiveTable>
              <thead className="bg-surface-2/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Backend</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Last Run</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Last Run Time</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{ws.name}</p>
                      {ws.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{ws.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <BackendBadge backend={ws.stateBackend} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {ws.lastRun ? <RunStatusBadge status={ws.lastRun.status} /> : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {ws.lastRun
                        ? new Date(ws.lastRun.startedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => runCommand.mutate({ workspaceId: ws.id, command: 'plan' })}
                          disabled={runCommand.isPending}
                          className="px-2.5 py-1 text-xs rounded bg-info/10 text-info hover:bg-info/20 border border-info/20 disabled:opacity-50"
                        >
                          Plan
                        </button>
                        <ConfirmDialog
                          trigger={
                            <button
                              disabled={runCommand.isPending}
                              className="px-2.5 py-1 text-xs rounded bg-success/10 text-success hover:bg-success/20 border border-success/20 disabled:opacity-50"
                            >
                              Apply
                            </button>
                          }
                          title={`Apply ${ws.name}?`}
                          description="This will run terraform apply -auto-approve. Make sure you have reviewed the plan."
                          confirmLabel="Apply"
                          onConfirm={() => runCommand.mutate({ workspaceId: ws.id, command: 'apply' })}
                        />
                        <ConfirmDialog
                          trigger={
                            <button className="px-2.5 py-1 text-xs rounded bg-error/10 text-error hover:bg-error/20 border border-error/20">
                              Delete
                            </button>
                          }
                          title={`Delete workspace ${ws.name}?`}
                          description="This will remove the workspace and its working directory from disk. This cannot be undone."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() => deleteWorkspace.mutate(ws.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          )}
        </Card>
      )}

      {/* ── Runs tab ── */}
      {tab === 'runs' && (
        <div className="space-y-4">
          {/* Workspace selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Workspace</label>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => { setSelectedWorkspaceId(e.target.value); setExpandedRunId(null); }}
              className="px-3 py-1.5 text-sm bg-surface-2 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            >
              <option value="">Select workspace…</option>
              {(workspaces ?? []).map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>

          {!selectedWorkspaceId ? (
            <p className="text-sm text-muted-foreground">Select a workspace to view its runs.</p>
          ) : runsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !runs?.length ? (
            <p className="text-sm text-muted-foreground">No runs yet for this workspace.</p>
          ) : (
            <Card>
              <div className="divide-y divide-border/50">
                {runs.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  const live = liveOutput[run.id] ?? [];
                  const outputLines =
                    run.status === 'RUNNING' || run.status === 'PENDING'
                      ? live
                      : run.output
                      ? run.output.split('\n')
                      : [];

                  return (
                    <div key={run.id}>
                      <button
                        onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50 text-left"
                      >
                        <CommandBadge command={run.command} />
                        <RunStatusBadge status={run.status} />
                        <PlanSummaryBadges summary={run.planSummary} />
                        <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">
                          {new Date(run.startedAt).toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground hidden md:inline">
                          {formatDuration(run.startedAt, run.finishedAt)}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4">
                          <pre className="bg-surface-2 border border-border rounded p-3 text-xs font-mono text-foreground overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                            {outputLines.length > 0
                              ? outputLines.join('\n')
                              : run.status === 'PENDING'
                              ? 'Waiting to start…'
                              : 'No output.'}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Module Library tab ── */}
      {tab === 'templates' && (
        <Grid cols={2}>
          {(templates ?? []).map((t) => (
            <Card key={t.key} className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              </div>
              {t.variables.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Variables</p>
                  <ul className="space-y-1">
                    {t.variables.map((v) => (
                      <li key={v.name} className="flex items-baseline gap-1.5">
                        <code className="text-xs font-mono text-accent">{v.name}</code>
                        {v.required && <span className="text-[10px] text-error">required</span>}
                        <span className="text-xs text-muted-foreground truncate">— {v.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={() => handleUseTemplate(t)}
                className="mt-auto px-3 py-1.5 text-sm rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 self-start"
              >
                Use Template
              </button>
            </Card>
          ))}
        </Grid>
      )}

      {/* New Workspace Modal */}
      {showNewModal && (
        <NewWorkspaceModal
          templates={templates ?? []}
          initialTemplate={prefilledTemplate}
          onClose={() => { setShowNewModal(false); setPrefilledTemplate(null); }}
          onCreated={() => qc.invalidateQueries({ queryKey: ['terraform-workspaces'] })}
        />
      )}
    </div>
  );
}

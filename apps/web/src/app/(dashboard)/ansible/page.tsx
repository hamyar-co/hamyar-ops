'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import type {
  AnsiblePlaybookDto,
  AnsibleJobDto,
  CreateAnsiblePlaybookDto,
  RunAnsiblePlaybookDto,
  DriftReport,
  ManagedServerDto,
} from '@hamyar-ops/shared';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ResponsiveTable } from '@/components/layout/ResponsiveComponents';

// ─── helpers ──────────────────────────────────────────────────────────────────

function duration(startedAt: string, finishedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ─── RunModal ─────────────────────────────────────────────────────────────────

function RunModal({
  playbook,
  servers,
  onClose,
  onRun,
  isRunning,
}: {
  playbook: AnsiblePlaybookDto;
  servers: ManagedServerDto[];
  onClose: () => void;
  onRun: (dto: RunAnsiblePlaybookDto) => void;
  isRunning: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [varsJson, setVarsJson] = useState('{}');
  const [varsError, setVarsError] = useState('');

  function toggleServer(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleRun() {
    let variables: Record<string, string> | undefined;
    try {
      const parsed = JSON.parse(varsJson);
      if (Object.keys(parsed).length > 0) variables = parsed;
      setVarsError('');
    } catch {
      setVarsError('Invalid JSON');
      return;
    }
    onRun({ serverIds: selectedIds, variables });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-lg space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Run — <span className="text-primary">{playbook.name}</span>
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Select servers</p>
          <div className="space-y-1 max-h-52 overflow-y-auto border border-border rounded-lg p-2">
            {servers.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 text-center">No servers configured</p>
            )}
            {servers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.id)}
                  onChange={() => toggleServer(s.id)}
                  className="accent-primary"
                />
                <span className="text-sm text-foreground">{s.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{s.host}:{s.port}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Extra variables (JSON)</p>
          <textarea
            value={varsJson}
            onChange={(e) => setVarsJson(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-black/40 border border-border text-foreground"
          />
          {varsError && <p className="text-xs text-error mt-1">{varsError}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={selectedIds.length === 0 || isRunning}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isRunning ? 'Queuing…' : 'Run Playbook'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PlaybookFormModal ────────────────────────────────────────────────────────

function PlaybookFormModal({
  initial,
  onClose,
  onSave,
  isSaving,
}: {
  initial?: AnsiblePlaybookDto;
  onClose: () => void;
  onSave: (dto: CreateAnsiblePlaybookDto) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<CreateAnsiblePlaybookDto>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    content: initial?.content ?? '',
    targetTags: initial?.targetTags ?? [],
  });
  const [tagsStr, setTagsStr] = useState((initial?.targetTags ?? []).join(', '));

  function handleSave() {
    onSave({
      ...form,
      targetTags: tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-2xl space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {initial ? 'Edit Playbook' : 'New Playbook'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Playbook name"
            className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
          />
          <input
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
            className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
          />
          <input
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="Target tags (comma-separated, e.g. web, db)"
            className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
          />
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="---&#10;- name: My playbook&#10;  hosts: all&#10;  tasks: []"
            rows={16}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-black/40 border border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name || !form.content || isSaving}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save Playbook'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LogPanel ─────────────────────────────────────────────────────────────────

function LogPanel({
  jobId,
  initialOutput,
  initialStatus,
}: {
  jobId: string;
  initialOutput: string | null;
  initialStatus: AnsibleJobDto['status'];
}) {
  const { socket } = useSocket();
  const [lines, setLines] = useState<string[]>(
    initialOutput ? initialOutput.split('\n').filter(Boolean) : [],
  );
  const [status, setStatus] = useState(initialStatus);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket || status === 'SUCCESS' || status === 'FAILED') return;

    const topic = `ansible:${jobId}`;
    socket.emit(WsEvents.SUBSCRIBE, topic);

    socket.on(WsEvents.ANSIBLE_LOG, (data: any) => {
      if (data.jobId === jobId) {
        setLines((prev) => [...prev, data.line]);
      }
    });

    socket.on(WsEvents.ANSIBLE_DONE, (data: any) => {
      if (data.jobId === jobId) {
        setStatus(data.status);
        socket.emit(WsEvents.UNSUBSCRIBE, topic);
      }
    });

    return () => {
      socket.off(WsEvents.ANSIBLE_LOG);
      socket.off(WsEvents.ANSIBLE_DONE);
      socket.emit(WsEvents.UNSUBSCRIBE, topic);
    };
  }, [socket, jobId, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="mt-2 bg-black/60 rounded-lg border border-border p-3 max-h-80 overflow-y-auto">
      {lines.length === 0 && (
        <p className="text-xs text-muted-foreground">Waiting for output…</p>
      )}
      <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all leading-5">
        {lines.join('\n')}
      </pre>
      <div ref={bottomRef} />
    </div>
  );
}

// ─── DriftBadge ───────────────────────────────────────────────────────────────

function DriftBadge({ drift }: { drift: boolean }) {
  return drift ? (
    <span className="px-2 py-0.5 text-xs rounded-full bg-error/15 text-error font-medium">Drift</span>
  ) : (
    <span className="px-2 py-0.5 text-xs rounded-full bg-success/15 text-success font-medium">OK</span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnsiblePage() {
  const [tab, setTab] = useState<'playbooks' | 'jobs' | 'drift'>('playbooks');
  const [runTarget, setRunTarget] = useState<AnsiblePlaybookDto | null>(null);
  const [formTarget, setFormTarget] = useState<AnsiblePlaybookDto | 'new' | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [driftResults, setDriftResults] = useState<Record<string, AnsibleJobDto>>({});
  const qc = useQueryClient();

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: playbooks = [], isLoading: pbLoading } = useQuery({
    queryKey: ['ansible-playbooks'],
    queryFn: () => apiClient.get('/ansible/playbooks').then((r) => r.data as AnsiblePlaybookDto[]),
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['ansible-jobs'],
    queryFn: () => apiClient.get('/ansible/jobs').then((r) => r.data as AnsibleJobDto[]),
    enabled: tab === 'jobs',
    refetchInterval: 5000,
  });

  const { data: dbServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data as ManagedServerDto[]),
  });
  const servers = [{ id: 'self', name: 'Current Server (Ops)', host: 'localhost', port: 22 } as unknown as ManagedServerDto, ...dbServers];

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createPb = useMutation({
    mutationFn: (dto: CreateAnsiblePlaybookDto) =>
      apiClient.post('/ansible/playbooks', dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ansible-playbooks'] });
      setFormTarget(null);
    },
  });

  const updatePb = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateAnsiblePlaybookDto> }) =>
      apiClient.put(`/ansible/playbooks/${id}`, dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ansible-playbooks'] });
      setFormTarget(null);
    },
  });

  const deletePb = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/ansible/playbooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ansible-playbooks'] }),
  });

  const runPb = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: RunAnsiblePlaybookDto }) =>
      apiClient.post(`/ansible/playbooks/${id}/run`, dto).then((r) => r.data as AnsibleJobDto),
    onSuccess: (data) => {
      setRunTarget(null);
      qc.invalidateQueries({ queryKey: ['ansible-jobs'] });
      setTab('jobs');
      setExpandedJobId(data.id);
    },
  });

  const checkDrift = useMutation({
    mutationFn: (serverId: string) =>
      apiClient.get(`/ansible/drift/${serverId}`).then((r) => r.data as AnsibleJobDto),
    onSuccess: (data, serverId) => {
      setDriftResults((prev) => ({ ...prev, [serverId]: data }));
      qc.invalidateQueries({ queryKey: ['ansible-jobs'] });
    },
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Ansible</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {playbooks.length} playbooks · {servers.length} servers
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {(['playbooks', 'jobs', 'drift'] as const).map((t) => (
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

      {/* ── Playbooks tab ────────────────────────────────────────────────── */}
      {tab === 'playbooks' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setFormTarget('new')}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              + New Playbook
            </button>
          </div>

          <ResponsiveTable>
            <thead className="bg-surface-2/50">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Description</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Tags</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Type</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {pbLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    Loading…
                  </td>
                </tr>
              )}
              {!pbLoading && playbooks.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    No playbooks yet
                  </td>
                </tr>
              )}
              {playbooks.map((pb) => (
                <tr key={pb.id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground text-sm">{pb.name}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                    {pb.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {pb.targetTags.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        pb.targetTags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {pb.builtIn ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-info/15 text-info font-medium">
                        built-in
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-surface-2 text-muted-foreground">
                        custom
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setRunTarget(pb)}
                        className="px-2.5 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        Run
                      </button>
                      <button
                        onClick={() => setFormTarget(pb)}
                        disabled={pb.builtIn}
                        className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete playbook "${pb.name}"?`)) deletePb.mutate(pb.id);
                        }}
                        disabled={pb.builtIn}
                        className="px-2.5 py-1 text-xs rounded bg-error/10 text-error hover:bg-error/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
      )}

      {/* ── Jobs tab ─────────────────────────────────────────────────────── */}
      {tab === 'jobs' && (
        <div className="space-y-2">
          <ResponsiveTable>
            <thead className="bg-surface-2/50">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Playbook</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Servers</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Started</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Duration</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {jobsLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">Loading…</td>
                </tr>
              )}
              {!jobsLoading && jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    No jobs yet — run a playbook from the Playbooks tab
                  </td>
                </tr>
              )}
              {jobs.map((job) => (
                <>
                  <tr
                    key={job.id}
                    className="hover:bg-surface-2/50 transition-colors cursor-pointer"
                    onClick={() =>
                      setExpandedJobId((prev) => (prev === job.id ? null : job.id))
                    }
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground text-sm">{job.playbookName}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm hidden sm:table-cell">
                      {job.serverIds.length}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status.toLowerCase()} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                      {new Date(job.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                      {duration(job.startedAt, job.finishedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedJobId((prev) => (prev === job.id ? null : job.id));
                        }}
                        className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expandedJobId === job.id ? 'Hide' : 'View Logs'}
                      </button>
                    </td>
                  </tr>
                  {expandedJobId === job.id && (
                    <tr key={`${job.id}-logs`} className="bg-surface-2/20">
                      <td colSpan={6} className="px-4 pb-4">
                        <LogPanel
                          jobId={job.id}
                          initialOutput={job.output}
                          initialStatus={job.status}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
      )}

      {/* ── Drift tab ────────────────────────────────────────────────────── */}
      {tab === 'drift' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Run the built-in <code className="text-xs bg-surface-2 px-1 rounded">drift-check</code>{' '}
            playbook against a server to detect configuration drift.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full py-8 text-center">
                No servers configured
              </p>
            )}
            {servers.map((server) => {
              const result = driftResults[server.id];
              const isChecking = checkDrift.isPending && checkDrift.variables === server.id;

              return (
                <div
                  key={server.id}
                  className="bg-surface border border-border rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground text-sm">{server.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {server.host}:{server.port}
                      </p>
                    </div>
                    <button
                      onClick={() => checkDrift.mutate(server.id)}
                      disabled={isChecking}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {isChecking ? 'Checking…' : 'Check Drift'}
                    </button>
                  </div>

                  {result && (
                    <div className="space-y-1.5">
                      {result.status === 'PENDING' || result.status === 'RUNNING' ? (
                        <p className="text-xs text-muted-foreground animate-pulse">
                          Running drift check…
                        </p>
                      ) : result.driftReport && result.driftReport.length > 0 ? (
                        result.driftReport.map((report) => (
                          <div key={report.serverId}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs text-muted-foreground">
                                Checked {new Date(report.checkedAt).toLocaleString()}
                              </p>
                              {report.hasDrift ? (
                                <span className="text-xs text-error">⚠ Has drift</span>
                              ) : (
                                <span className="text-xs text-success">✓ Clean</span>
                              )}
                            </div>
                            <div className="border border-border rounded-lg overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border bg-surface-2/50">
                                    <th className="text-left text-muted-foreground px-3 py-1.5">Check</th>
                                    <th className="text-left text-muted-foreground px-3 py-1.5">Expected</th>
                                    <th className="text-left text-muted-foreground px-3 py-1.5">Actual</th>
                                    <th className="text-left text-muted-foreground px-3 py-1.5">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {report.checks.map((check) => (
                                    <tr
                                      key={check.name}
                                      className="border-b border-border/50 last:border-0"
                                    >
                                      <td className="px-3 py-1.5 font-mono text-foreground">{check.name}</td>
                                      <td className="px-3 py-1.5 text-muted-foreground">{check.expected}</td>
                                      <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                        {check.actual}
                                      </td>
                                      <td className="px-3 py-1.5">
                                        <DriftBadge drift={check.drift} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Job queued — results will appear once the playbook finishes.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {runTarget && (
        <RunModal
          playbook={runTarget}
          servers={servers}
          onClose={() => setRunTarget(null)}
          onRun={(dto) => runPb.mutate({ id: runTarget.id, dto })}
          isRunning={runPb.isPending}
        />
      )}

      {formTarget !== null && (
        <PlaybookFormModal
          initial={formTarget === 'new' ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
          onSave={(dto) => {
            if (formTarget === 'new') {
              createPb.mutate(dto);
            } else {
              updatePb.mutate({ id: formTarget.id, dto });
            }
          }}
          isSaving={createPb.isPending || updatePb.isPending}
        />
      )}
    </div>
  );
}

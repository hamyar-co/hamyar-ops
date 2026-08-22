'use client';

import { useState, use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, authDownloadUrl } from '@/lib/api';
import type { AppVersionDto, AppScheduleDto } from '@hamyar-ops/shared';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'text-success bg-success/10',
  FAILED: 'text-error bg-error/10',
  IN_PROGRESS: 'text-info bg-info/10',
  PENDING: 'text-muted-foreground bg-surface-2',
  ROLLED_BACK: 'text-warning bg-warning/10',
};

function SchedulesPanel({ pm2Name }: { pm2Name: string }) {
  const qc = useQueryClient();
  const { data: schedules = [] } = useQuery({
    queryKey: ['schedules', pm2Name],
    queryFn: () => apiClient.get(`/applications/${pm2Name}/schedules`).then((r) => r.data as AppScheduleDto[]),
  });

  const [newCron, setNewCron] = useState('0 3 * * 0');
  const [newAction, setNewAction] = useState('restart');
  const [newLabel, setNewLabel] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiClient.post(`/applications/${pm2Name}/schedules`, {
        cron: newCron,
        action: newAction,
        label: newLabel || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules', pm2Name] });
      setNewLabel('');
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.put(`/applications/${pm2Name}/schedules/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', pm2Name] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/applications/${pm2Name}/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', pm2Name] }),
  });

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <h2 className="font-semibold text-foreground">Scheduled Restarts</h2>

      {schedules.length === 0 && (
        <p className="text-sm text-muted-foreground">No schedules configured.</p>
      )}

      <div className="space-y-2">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">{s.cron}</span>
            <span className="text-foreground shrink-0">{s.action}</span>
            <span className="text-muted-foreground flex-1 truncate">{s.label ?? ''}</span>
            {s.lastRanAt && (
              <span className="text-xs text-muted-foreground shrink-0">
                last: {new Date(s.lastRanAt).toLocaleString()}
              </span>
            )}
            <button
              onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })}
              className={`px-2 py-0.5 text-xs rounded shrink-0 ${s.enabled ? 'bg-success/10 text-success' : 'bg-surface text-muted-foreground'}`}
            >
              {s.enabled ? 'On' : 'Off'}
            </button>
            <ConfirmDialog
              trigger={
                <button className="text-xs text-error hover:underline shrink-0">Delete</button>
              }
              title="Delete schedule?"
              description="This will permanently remove this scheduled restart."
              confirmLabel="Delete"
              destructive
              onConfirm={() => remove.mutate(s.id)}
            />
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-border space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Add Schedule</p>
        <div className="flex gap-2 flex-wrap">
          <input
            value={newCron}
            onChange={(e) => setNewCron(e.target.value)}
            placeholder="Cron (e.g. 0 3 * * 0)"
            className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 border border-border text-foreground font-mono w-40"
          />
          <select
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 border border-border text-foreground"
          >
            <option value="restart">restart</option>
            <option value="reload">reload</option>
            <option value="stop">stop</option>
          </select>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 border border-border text-foreground flex-1 min-w-24"
          />
          <button
            onClick={() => create.mutate()}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppHistoryPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: pm2Name } = use(params);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['app-versions', pm2Name, page],
    queryFn: () =>
      apiClient
        .get(`/applications/${pm2Name}/versions?page=${page}&limit=20`)
        .then((r) => r.data as { data: AppVersionDto[]; total: number }),
  });

  const rollback = useMutation({
    mutationFn: (versionId: string) =>
      apiClient.post(`/applications/${pm2Name}/rollback/${versionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-versions', pm2Name] }),
  });

  const versions = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href="/applications" className="text-muted-foreground hover:text-foreground text-sm">
          ← Applications
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{pm2Name} — History</h1>
      </div>

      <SchedulesPanel pm2Name={pm2Name} />

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Version / Commit</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Deployed By</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Started</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Duration</th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</td></tr>
            )}
            {versions.map((v) => {
              const duration = v.finishedAt
                ? Math.round((new Date(v.finishedAt).getTime() - new Date(v.startedAt).getTime()) / 1000)
                : null;
              return (
                <tr key={v.id} className="border-b border-border/50 last:border-0 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-foreground">{v.tag ?? v.commitHash?.slice(0, 7) ?? '—'}</span>
                      {v.commitMsg && (
                        <div className="text-xs text-muted-foreground truncate max-w-xs">{v.commitMsg}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${STATUS_COLORS[v.status] ?? ''}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{v.deployedBy ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(v.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {duration !== null ? `${duration}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {v.status === 'SUCCESS' && (
                        <ConfirmDialog
                          trigger={
                            <button className="px-2.5 py-1 text-xs rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors">
                              Rollback
                            </button>
                          }
                          title="Rollback to this version?"
                          description={`This will re-run the deploy for version ${v.tag ?? v.commitHash?.slice(0, 7) ?? v.id.slice(0, 8)}.`}
                          confirmLabel="Rollback"
                          destructive
                          onConfirm={() => rollback.mutate(v.id)}
                        />
                      )}
                      <a
                        href={authDownloadUrl(`${apiClient.defaults.baseURL}/applications/${pm2Name}/versions/${v.id}/download`)}
                        download
                        className="px-2.5 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors inline-block"
                      >
                        Download
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && versions.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No deploy history yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

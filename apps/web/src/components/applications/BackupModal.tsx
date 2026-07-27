'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, authDownloadUrl } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import type { BackupRecordDto, BackupTargetType, RestoreResultDto } from '@hamyar-ops/shared';
import { formatBytes } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface Props {
  targetType: BackupTargetType;
  targetName: string;
  title: string;
  onClose: () => void;
}

export function BackupModal({ targetType, targetName, title, onClose }: Props) {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const logsRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ text: string; stream: string }[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResultDto | null>(null);

  const qk = ['backups', targetType, targetName];

  const { data: records = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: () => apiClient.get(`/backups/list/${targetType}/${encodeURIComponent(targetName)}`).then((r) => r.data as BackupRecordDto[]),
    refetchInterval: runningId ? 2000 : 15000,
  });

  const runBackup = useMutation({
    mutationFn: () => apiClient.post('/backups/run', { targetType, targetName }),
    onSuccess: (res) => {
      setRunningId(res.data.recordId);
      setLines([]);
    },
  });

  useEffect(() => {
    if (!socket || !runningId) return;
    const topic = `backup:logs:${runningId}`;
    socket.emit(WsEvents.SUBSCRIBE, { topics: [topic] });

    const onLog = (d: any) => {
      if (d.recordId !== runningId) return;
      setLines((p) => [...p, { text: d.line, stream: d.stream }]);
      setTimeout(() => logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight }), 10);
    };
    const onDone = (d: any) => {
      if (d.recordId !== runningId) return;
      setTimeout(() => {
        setRunningId(null);
        qc.invalidateQueries({ queryKey: qk });
      }, 500);
    };
    socket.on(WsEvents.BACKUP_LOG, onLog);
    socket.on(WsEvents.BACKUP_DONE, onDone);
    return () => {
      socket.off(WsEvents.BACKUP_LOG, onLog);
      socket.off(WsEvents.BACKUP_DONE, onDone);
      socket.emit(WsEvents.UNSUBSCRIBE, { topics: [topic] });
    };
  }, [socket, runningId, qc]);

  const restore = useMutation({
    mutationFn: (id: string) => apiClient.post(`/backups/restore/${id}`, { overwrite: true }),
    onSuccess: (res) => setRestoreResult(res.data),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/backups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const download = async (id: string, fileName?: string) => {
    try {
      const res = await apiClient.get(`/backups/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'backup.tar.gz';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl w-full max-w-3xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{targetType}/{targetName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => runBackup.mutate()}
              disabled={runningId !== null}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {runningId ? 'Backing up…' : 'Backup now'}
            </button>
            <span className="text-xs text-muted-foreground">tar.gz — excludes node_modules/.next/dist/.git</span>
          </div>

          {/* Live log */}
          {lines.length > 0 && (
            <div ref={logsRef} className="bg-black/40 rounded-lg p-3 font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto">
              {lines.map((l, i) => (
                <div key={i} className={l.stream === 'stderr' ? 'text-warning' : 'text-foreground/80'}>{l.text}</div>
              ))}
            </div>
          )}

          {/* Restore result */}
          {restoreResult && (
            <div className="bg-surface-2 border border-border rounded-lg p-3">
              <p className={`text-xs font-semibold ${restoreResult.ok ? 'text-success' : 'text-error'}`}>{restoreResult.message}</p>
              <pre className="text-xs text-muted-foreground mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">{restoreResult.lines.join('\n')}</pre>
              <button onClick={() => setRestoreResult(null)} className="text-xs text-muted-foreground hover:text-foreground mt-2">dismiss</button>
            </div>
          )}

          {/* Records */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-surface-2">Backups</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-muted-foreground px-3 py-2">Created</th>
                  <th className="text-left text-xs text-muted-foreground px-3 py-2">Storage</th>
                  <th className="text-left text-xs text-muted-foreground px-3 py-2">Size</th>
                  <th className="text-left text-xs text-muted-foreground px-3 py-2">Status</th>
                  <th className="text-right text-xs text-muted-foreground px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Loading…</td></tr>}
                {!isLoading && records.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">No backups yet</td></tr>
                )}
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 text-xs text-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${r.storage === 's3' ? 'bg-info/10 text-info' : 'bg-surface-2 text-muted-foreground'}`}>{r.storage}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.sizeBytes ? formatBytes(r.sizeBytes) : '–'}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${r.status === 'SUCCESS' ? 'bg-success/10 text-success' : r.status === 'FAILED' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => download(r.id)} disabled={r.status !== 'SUCCESS'} className="px-2 py-0.5 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground disabled:opacity-40">Download</button>
                        <button onClick={() => restore.mutate(r.id)} disabled={r.status !== 'SUCCESS'} className="px-2 py-0.5 text-xs rounded bg-info/10 text-info hover:bg-info/20 disabled:opacity-40">Restore</button>
                        <ConfirmDialog
                          trigger={<button className="px-2 py-0.5 text-xs rounded bg-error/10 text-error hover:bg-error/20">Del</button>}
                          title="Delete backup?"
                          description="This permanently removes the backup file."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() => del.mutate(r.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
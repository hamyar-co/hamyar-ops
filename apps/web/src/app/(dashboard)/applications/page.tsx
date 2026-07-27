'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import type {
  AppConfigDto,
  AppVersionDto,
  AppHealthDto,
  AppSslDto,
  DeployLogLineEventDto,
  DeployDoneEventDto,
} from '@hamyar-ops/shared';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AppTerminalModal } from '@/components/applications/AppTerminalModal';
import { BackupModal } from '@/components/applications/BackupModal';
import { CreateAppWizardModal } from '@/components/applications/CreateAppWizardModal';
import Link from 'next/link';

function SslBadge({ ssl }: { ssl: AppSslDto | null }) {
  if (!ssl) return null;
  const days = ssl.daysRemaining;
  if (days === null) return <span className="px-1.5 py-0.5 text-xs rounded bg-error/10 text-error">SSL Error</span>;
  if (days <= 7) return <span className="px-1.5 py-0.5 text-xs rounded bg-error/10 text-error">{days}d left</span>;
  if (days <= 30) return <span className="px-1.5 py-0.5 text-xs rounded bg-warning/10 text-warning">{days}d left</span>;
  return <span className="px-1.5 py-0.5 text-xs rounded bg-success/10 text-success">{days}d</span>;
}

function HealthBadge({ health }: { health: AppHealthDto | null }) {
  if (!health) return null;
  return health.healthy ? (
    <span className="px-1.5 py-0.5 text-xs rounded bg-success/10 text-success">{health.uptimePercent}% up</span>
  ) : (
    <span className="px-1.5 py-0.5 text-xs rounded bg-error/10 text-error">Down ({health.consecutiveFailures}x)</span>
  );
}

function DeployLogModal({
  app,
  onClose,
}: {
  app: AppConfigDto;
  onClose: () => void;
}) {
  const { socket } = useSocket();
  const qc = useQueryClient();
  const logsRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ text: string; stream: string }[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [exitStatus, setExitStatus] = useState<string>('');

  const deploy = useMutation({
    mutationFn: () => apiClient.post(`/applications/${app.pm2Name}/deploy`),
    onSuccess: () => {
      setStatus('running');
      setLines([]);
    },
  });

  useEffect(() => {
    if (!socket) return;
    const topic = `deploy:logs:${app.pm2Name}`;
    socket.emit(WsEvents.SUBSCRIBE, { topics: [topic] });

    const onLog = (data: DeployLogLineEventDto) => {
      if (data.appName !== app.pm2Name) return;
      setLines((prev) => [...prev, { text: data.line, stream: data.stream }]);
      setTimeout(() => {
        logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight });
      }, 10);
    };

    const onDone = (data: DeployDoneEventDto) => {
      if (data.appName !== app.pm2Name) return;
      setStatus('done');
      setExitStatus(data.status);
      qc.invalidateQueries({ queryKey: ['applications'] });
    };

    socket.on(WsEvents.DEPLOY_LOG, onLog);
    socket.on(WsEvents.DEPLOY_DONE, onDone);

    return () => {
      socket.off(WsEvents.DEPLOY_LOG, onLog);
      socket.off(WsEvents.DEPLOY_DONE, onDone);
      socket.emit(WsEvents.UNSUBSCRIBE, { topics: [topic] });
    };
  }, [socket, app.pm2Name, qc]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl w-full max-w-3xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Deploy — {app.name}</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{app.deployCmd ?? 'No deploy command set'}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>

        <div
          ref={logsRef}
          className="flex-1 overflow-y-auto bg-black/40 font-mono text-xs p-4 space-y-0.5 min-h-48"
        >
          {lines.length === 0 && status === 'idle' && (
            <p className="text-muted-foreground">Click Deploy to start…</p>
          )}
          {lines.map((l, i) => (
            <div key={i} className={l.stream === 'stderr' ? 'text-warning' : 'text-foreground/80'}>
              {l.text}
            </div>
          ))}
          {status === 'done' && (
            <div className={`mt-2 font-semibold ${exitStatus === 'SUCCESS' ? 'text-success' : 'text-error'}`}>
              — Deploy {exitStatus} —
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => deploy.mutate()}
            disabled={status === 'running' || !app.deployCmd}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {status === 'running' ? 'Deploying…' : 'Deploy'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppCard({
  app,
  pm2Status,
  currentVersion,
  health,
  ssl,
  serverName,
}: {
  app: AppConfigDto;
  pm2Status?: string;
  currentVersion?: AppVersionDto;
  health: AppHealthDto | null;
  ssl: AppSslDto | null;
  serverName?: string;
}) {
  const [showDeploy, setShowDeploy] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const qc = useQueryClient();

  const pm2Action = useMutation({
    mutationFn: ({ act }: { act: string }) =>
      apiClient.post(`/pm2/processes/${app.pm2Name}/${act}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  });

  const status = pm2Status ?? 'unknown';

  return (
    <>
      <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">{app.name}</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{app.pm2Name}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <StatusBadge status={status} />
            <HealthBadge health={health} />
            <SslBadge ssl={ssl} />
            {serverName && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-muted-foreground border border-border/50" title="Target server">
                {serverName}
              </span>
            )}
          </div>
        </div>

        {/* Version info */}
        {currentVersion && (
          <div className="text-xs text-muted-foreground bg-surface-2 rounded-lg px-3 py-2">
            <span className="text-foreground font-medium">{currentVersion.tag ?? currentVersion.commitHash?.slice(0, 7) ?? 'deployed'}</span>
            {currentVersion.commitMsg && (
              <span className="ml-2 truncate block">{currentVersion.commitMsg}</span>
            )}
            <span className="mt-0.5 block">{new Date(currentVersion.startedAt).toLocaleString()}</span>
          </div>
        )}

        {/* Domain / health url */}
        {(app.domain || app.healthUrl) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {app.domain && <div>Domain: <span className="text-foreground">{app.domain}</span></div>}
            {app.healthUrl && health && (
              <div>Latency: <span className="text-foreground">{health.responseTimeMs}ms</span></div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            onClick={() => pm2Action.mutate({ act: 'restart' })}
            className="px-2.5 py-1 text-xs rounded bg-info/10 text-info hover:bg-info/20 transition-colors"
          >
            Restart
          </button>
          {status === 'online' ? (
            <button
              onClick={() => pm2Action.mutate({ act: 'stop' })}
              className="px-2.5 py-1 text-xs rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => pm2Action.mutate({ act: 'reload' })}
              className="px-2.5 py-1 text-xs rounded bg-success/10 text-success hover:bg-success/20 transition-colors"
            >
              Start
            </button>
          )}
          <button
            onClick={() => setShowDeploy(true)}
            disabled={!app.deployCmd}
            className="px-2.5 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
            title={app.deployCmd ? 'Trigger redeploy' : 'No deploy command configured'}
          >
            Deploy
          </button>
          <Link
            href={`/env?app=${app.pm2Name}`}
            className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Env
          </Link>
          <Link
            href={`/applications/${app.pm2Name}/history`}
            className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            History
          </Link>
          <Link
            href={`/logs?source=pm2&name=${app.pm2Name}`}
            className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Logs
          </Link>
          <button
            onClick={() => setShowBackup(true)}
            className="px-2.5 py-1 text-xs rounded bg-success/10 text-success hover:bg-success/20 transition-colors"
          >
            Backup
          </button>
          <button
            onClick={() => setShowTerminal(true)}
            className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors font-mono"
            title="Open terminal into this app"
          >
            {'>'}_term
          </button>
          <Link
            href={`/applications/${app.pm2Name}`}
            className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Details
          </Link>
          <Link
            href={`/applications/${app.pm2Name}/edit`}
            className="px-2.5 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      {showDeploy && <DeployLogModal app={app} onClose={() => setShowDeploy(false)} />}
      {showTerminal && <AppTerminalModal pm2Name={app.pm2Name} onClose={() => setShowTerminal(false)} />}
      {showBackup && (
        <BackupModal targetType="app" targetName={app.pm2Name} title={`Backup — ${app.name}`} onClose={() => setShowBackup(false)} />
      )}
    </>
  );
}

export default function ApplicationsPage() {
  const { socket } = useSocket();
  const qc = useQueryClient();
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get('/applications').then((r) => r.data as (AppConfigDto & { pm2Status?: string; currentVersion?: AppVersionDto })[]),
    refetchInterval: 10000,
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data as { id: string; name: string }[]),
  });

  const createApp = useMutation({
    mutationFn: (data: any) => apiClient.post('/applications', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      setIsWizardOpen(false);
    },
  });

  const serverMap = new Map(servers.map((s) => [s.id, s.name]));

  const { data: healthAll = {} } = useQuery({
    queryKey: ['app-health-all'],
    queryFn: () => apiClient.get('/app-health/_/health-all').then((r) => r.data as Record<string, AppHealthDto>),
    refetchInterval: 65000,
  });

  const { data: sslAll = {} } = useQuery({
    queryKey: ['app-ssl-all'],
    queryFn: () => apiClient.get('/app-health/_/ssl-all').then((r) => r.data as Record<string, AppSslDto>),
    refetchInterval: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (!socket) return;
    const onStatus = () => qc.invalidateQueries({ queryKey: ['applications'] });
    socket.on(WsEvents.PM2_STATUS, onStatus);
    return () => { socket.off(WsEvents.PM2_STATUS, onStatus); };
  }, [socket, qc]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Applications</h1>
          <p className="text-sm text-muted-foreground mt-1">{apps.length} registered apps</p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useState, use } from 'react';
import Link from 'next/link';
import type { AppConfigDto, AppVersionDto, AppHealthDto, AppSslDto } from '@hamyar-ops/shared';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AppTerminalModal } from '@/components/applications/AppTerminalModal';
import { BackupModal } from '@/components/applications/BackupModal';

export default function AppDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = use(params);
  const name = decodeURIComponent(rawName);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showBackup, setShowBackup] = useState(false);

  const { data: apps = [] } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get('/applications').then((r) => r.data as (AppConfigDto & { pm2Status?: string; currentVersion?: AppVersionDto })[]),
  });
  const app = apps.find((a) => a.pm2Name === name);

  const { data: healthAll = {} } = useQuery({
    queryKey: ['app-health-all'],
    queryFn: () => apiClient.get('/app-health/_/health-all').then((r) => r.data as Record<string, AppHealthDto>),
    refetchInterval: 65000,
  });
  const { data: sslAll = {} } = useQuery({
    queryKey: ['app-ssl-all'],
    queryFn: () => apiClient.get('/app-health/_/ssl-all').then((r) => r.data as Record<string, AppSslDto>),
    refetchInterval: 3600000,
  });

  if (!app) return <div className="text-muted-foreground">Application not found.</div>;

  const health = healthAll[app.pm2Name] ?? null;
  const ssl = sslAll[app.pm2Name] ?? null;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/applications" className="text-sm text-muted-foreground hover:text-foreground">← Applications</Link>
          <h1 className="text-2xl font-semibold text-foreground mt-1">{app.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{app.pm2Name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/applications/${app.pm2Name}/edit`} className="px-3 py-1.5 text-xs bg-primary/10 border border-primary/20 text-primary rounded-lg hover:bg-primary/20">Edit</Link>
          <button onClick={() => setShowBackup(true)} className="px-3 py-1.5 text-xs bg-success/10 text-success border border-success/20 rounded-lg hover:bg-success/20">Backup</button>
          <button onClick={() => setShowTerminal(true)} className="px-3 py-1.5 text-xs bg-surface-2 border border-border rounded-lg hover:text-foreground font-mono">{'>'}_Terminal</button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <StatusBadge status={app.pm2Status ?? 'unknown'} />
        {health && (health.healthy
          ? <span className="px-2 py-0.5 text-xs rounded bg-success/10 text-success">{health.uptimePercent}% up · {health.responseTimeMs}ms</span>
          : <span className="px-2 py-0.5 text-xs rounded bg-error/10 text-error">Down ({health.consecutiveFailures}x)</span>)}
        {ssl && ssl.daysRemaining !== null && (
          <span className={`px-2 py-0.5 text-xs rounded ${ssl.daysRemaining <= 7 ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}`}>SSL {ssl.daysRemaining}d</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Domain" value={app.domain} />
        <Field label="Health URL" value={app.healthUrl} mono />
        <Field label="Deploy path" value={app.deployPath} mono />
        <Field label="Env path" value={app.envPath} mono />
        <Field label="Deploy command" value={app.deployCmd} mono />
        <Field label="Repository" value={app.repoUrl} mono />
        <Field label="Branch" value={app.branch} />
        <Field label="Container" value={app.containerName} mono />
        <Field label="Database" value={app.dbType ? `${app.dbType}/${app.dbName}` : null} mono />
      </div>

      {showTerminal && <AppTerminalModal pm2Name={app.pm2Name} onClose={() => setShowTerminal(false)} />}
      {showBackup && <BackupModal targetType="app" targetName={app.pm2Name} title={`Backup — ${app.name}`} onClose={() => setShowBackup(false)} />}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm text-foreground mt-1 break-all ${mono ? 'font-mono' : ''}`}>{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
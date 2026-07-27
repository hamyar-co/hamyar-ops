'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MetricCard } from '@/components/charts/MetricCard';

interface PublicStatusApp {
  name: string;
  status: string;
  url?: string | null;
  activeIncident?: string | null;
}

interface PublicStatusDto {
  overall: 'up' | 'degraded' | 'down';
  apps: PublicStatusApp[];
  snapshot: {
    totalApps: number;
    upCount: number;
    downCount: number;
    degradedCount: number;
  } | null;
  updatedAt: string;
}

interface ManagedServerBasic {
  id: string;
  name: string;
  host: string;
  isActive: boolean;
  lastPingOk: boolean;
}

interface InstallStatus {
  prometheus: boolean;
  grafana: boolean;
  loki: boolean;
}

interface ServerInstallState {
  loading: boolean;
  status: InstallStatus | null;
  error: string | null;
  jobId: string | null;
}

export default function ObservabilityPage() {
  const [tab, setTab] = useState<'overview' | 'grafana' | 'prometheus' | 'install'>('overview');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [installStates, setInstallStates] = useState<Record<string, ServerInstallState>>({});
  const [copied, setCopied] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['observability-status'],
    queryFn: () => apiClient.get('/observability/status').then((r) => r.data as PublicStatusDto),
    refetchInterval: 30000,
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data as ManagedServerBasic[]),
  });

  const { data: grafanaUrl } = useQuery({
    queryKey: ['grafana-url', selectedServerId],
    queryFn: () =>
      apiClient.get(`/observability/grafana/${selectedServerId}`).then((r) => r.data as { url: string }),
    enabled: !!selectedServerId && tab === 'grafana',
  });

  const { data: promTargets, isLoading: targetsLoading } = useQuery({
    queryKey: ['prometheus-targets'],
    queryFn: () => apiClient.get('/observability/prometheus-targets').then((r) => r.data),
    enabled: tab === 'prometheus',
  });

  const loadInstallStatus = async (serverId: string) => {
    setInstallStates((prev) => ({
      ...prev,
      [serverId]: { loading: true, status: null, error: null, jobId: null },
    }));
    try {
      const res = await apiClient.get(`/observability/install-status/${serverId}`);
      setInstallStates((prev) => ({
        ...prev,
        [serverId]: { loading: false, status: res.data as InstallStatus, error: null, jobId: null },
      }));
    } catch (e: any) {
      setInstallStates((prev) => ({
        ...prev,
        [serverId]: { loading: false, status: null, error: e.message, jobId: null },
      }));
    }
  };

  const installStack = useMutation({
    mutationFn: (serverId: string) =>
      apiClient.post(`/observability/install/${serverId}`).then((r) => r.data as { jobId: string }),
    onSuccess: (data, serverId) => {
      setInstallStates((prev) => ({
        ...prev,
        [serverId]: { ...(prev[serverId] ?? { loading: false, status: null, error: null }), jobId: data.jobId },
      }));
    },
  });

  const handleCopyTargets = () => {
    if (!promTargets) return;
    navigator.clipboard.writeText(JSON.stringify(promTargets, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalApps = status?.snapshot?.totalApps ?? status?.apps.length ?? 0;
  const upCount = status?.snapshot?.upCount ?? status?.apps.filter((a) => a.status === 'up').length ?? 0;
  const downCount = status?.snapshot?.downCount ?? status?.apps.filter((a) => a.status === 'down').length ?? 0;

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'grafana' as const, label: 'Grafana' },
    { id: 'prometheus' as const, label: 'Prometheus' },
    { id: 'install' as const, label: 'Install' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Observability</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Monitoring stack status, Grafana dashboards, and Prometheus targets</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors -mb-px border-b-2 ${
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Overall badge */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Overall system status:</span>
            <StatusBadge status={status?.overall === 'up' ? 'running' : status?.overall === 'degraded' ? 'launching' : 'errored'} />
            {status?.updatedAt && (
              <span className="text-xs text-muted-foreground">
                Updated {new Date(status.updatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              title="Total Apps"
              value={String(totalApps)}
              subtitle="Monitored applications"
              color="info"
              percent={null}
            />
            <MetricCard
              title="Up"
              value={String(upCount)}
              subtitle={`${totalApps > 0 ? Math.round((upCount / totalApps) * 100) : 0}% availability`}
              color="success"
              percent={totalApps > 0 ? (upCount / totalApps) * 100 : 0}
            />
            <MetricCard
              title="Down"
              value={String(downCount)}
              subtitle="Needs attention"
              color="error"
              percent={totalApps > 0 ? (downCount / totalApps) * 100 : 0}
            />
          </div>

          {/* App list */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Applications</h3>
            </div>
            {statusLoading && (
              <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
            )}
            {!statusLoading && (status?.apps ?? []).length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">No applications configured</div>
            )}
            {!statusLoading && (
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">App</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">URL</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Active Incident</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(status?.apps ?? []).map((app) => (
                    <tr key={app.name} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground text-sm">{app.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={app.status === 'up' ? 'running' : app.status === 'degraded' ? 'launching' : 'errored'} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {app.url ? (
                          <a href={app.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors truncate block max-w-xs">
                            {app.url}
                          </a>
                        ) : '–'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {app.activeIncident ?? '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Grafana ── */}
      {tab === 'grafana' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground"
            >
              <option value="">Select a server…</option>
              <option value="self">Current Server (Ops)</option>
              {(servers ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
              ))}
            </select>
          </div>

          {!selectedServerId && (
            <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              Select a server above to open its Grafana dashboard
            </div>
          )}

          {selectedServerId && grafanaUrl && (
            <div className="space-y-2">
              <iframe
                src={grafanaUrl.url}
                className="w-full h-[600px] rounded-xl border border-border"
                title="Grafana Dashboard"
              />
              <p className="text-xs text-muted-foreground">
                Grafana URL:{' '}
                <a
                  href={grafanaUrl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline"
                >
                  {grafanaUrl.url}
                </a>
              </p>
            </div>
          )}

          {selectedServerId && !grafanaUrl && (
            <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              Loading Grafana URL…
            </div>
          )}
        </div>
      )}

      {/* ── Prometheus ── */}
      {tab === 'prometheus' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Prometheus Scrape Targets</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Node exporter targets for all active managed servers</p>
              </div>
              <button
                onClick={handleCopyTargets}
                disabled={!promTargets}
                className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
            </div>
            <div className="p-4">
              {targetsLoading && (
                <div className="text-center py-6 text-muted-foreground text-sm">Loading…</div>
              )}
              {!targetsLoading && (
                <pre className="p-4 rounded-lg bg-black/40 border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre">
                  {JSON.stringify(promTargets ?? [], null, 2)}
                </pre>
              )}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Usage</h3>
            <p className="text-xs text-muted-foreground">Add this endpoint to your Prometheus <code className="font-mono">scrape_configs</code> as a file-based service discovery or paste the JSON directly into a static targets file:</p>
            <pre className="p-3 rounded-lg bg-black/40 border border-border text-xs font-mono text-muted-foreground overflow-x-auto">
              {`scrape_configs:
  - job_name: 'hamyar-nodes'
    file_sd_configs:
      - files:
        - '/etc/prometheus/targets.json'`}
            </pre>
          </div>
        </div>
      )}

      {/* ── Install ── */}
      {tab === 'install' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Monitoring Stack Installation</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Check and install Prometheus, Grafana, and Loki (Promtail) on managed servers</p>
            </div>
            {(servers ?? []).length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">No servers configured. Add servers in the Servers section first.</div>
            )}
            <div className="divide-y divide-border/50">
              {(servers ?? []).map((server) => {
                const state = installStates[server.id];
                return (
                  <div key={server.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-foreground text-sm">{server.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{server.host}</div>
                    </div>

                    {/* Install status badges */}
                    {state?.status && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Prometheus:</span>
                          <StatusBadge status={state.status.prometheus ? 'running' : 'stopped'} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Grafana:</span>
                          <StatusBadge status={state.status.grafana ? 'running' : 'stopped'} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Loki:</span>
                          <StatusBadge status={state.status.loki ? 'running' : 'stopped'} />
                        </div>
                      </div>
                    )}

                    {state?.error && (
                      <span className="text-xs text-error">{state.error}</span>
                    )}

                    {state?.jobId && (
                      <span className="text-xs text-success">Install job started — job ID: {state.jobId}</span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadInstallStatus(server.id)}
                        disabled={state?.loading}
                        className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                      >
                        {state?.loading ? 'Checking…' : 'Check Status'}
                      </button>
                      <button
                        onClick={() => installStack.mutate(server.id)}
                        disabled={installStack.isPending}
                        className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {installStack.isPending ? 'Installing…' : 'Install Stack'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

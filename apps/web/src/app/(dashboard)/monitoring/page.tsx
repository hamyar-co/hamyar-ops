'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { SparklineChart } from '@/components/charts/SparklineChart';
import type { MetricHistoryDto } from '@hamyar-ops/shared';
import { CustomTabs } from '@/components/ui/CustomTabs';

type Tab = 'server' | 'apps' | 'containers' | 'alerts' | 'dependencies';
type Period = '1h' | '6h' | '24h';

const SERVER_CHARTS = [
  { metric: 'cpu', label: 'CPU Usage', color: '#3b82f6', unit: '%' },
  { metric: 'ram', label: 'Memory Usage', color: '#f59e0b', unit: '%' },
  { metric: 'disk', label: 'Disk Usage', color: '#22c55e', unit: '%' },
  { metric: 'network', label: 'Network In (B/s)', color: '#a855f7', unit: ' B/s' },
] as const;

const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'eq', label: '=' },
];

const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;

export default function MonitoringPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('server');
  const [period, setPeriod] = useState<Period>('1h');

  const tabs = [
    { id: 'server', label: 'Server Metrics', icon: <span>📊</span> },
    { id: 'apps', label: 'Applications', icon: <span>🚀</span> },
    { id: 'containers', label: 'Containers', icon: <span>🐳</span> },
    { id: 'alerts', label: 'Alert Rules', icon: <span>🔔</span> },
    { id: 'dependencies', label: 'Dependencies', icon: <span>🧩</span> },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Real-time Telemetry & Monitoring</h1>
          <p className="text-xs text-muted-foreground mt-1">Live metrics, alert thresholds, sparkline charts, and container health.</p>
        </div>
      </div>

      <CustomTabs tabs={tabs} activeTab={tab} onChange={(id) => setTab(id as Tab)} />

      {tab === 'server' && <ServerMetrics period={period} setPeriod={setPeriod} />}
      {tab === 'apps' && <AppsMonitoring />}
      {tab === 'containers' && <ContainersMonitoring />}
      {tab === 'alerts' && <AlertsSection qc={qc} />}
      {tab === 'dependencies' && <DependenciesSection />}
    </div>
  );
}

function ServerMetrics({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  const { data: metrics } = useQuery({
    queryKey: ['server-metrics'],
    queryFn: () => apiClient.get('/server/metrics').then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-4">
      <DetailedMetrics metrics={metrics} />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Range:</span>
        {(['1h', '6h', '24h'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${period === p ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >{p}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SERVER_CHARTS.map((c) => (
          <MetricChart key={c.metric} metric={c.metric} label={c.label} color={c.color} unit={c.unit} period={period} />
        ))}
      </div>
    </div>
  );
}

function DetailedMetrics({ metrics }: { metrics: any }) {
  if (!metrics) {
    return <div className="text-sm text-muted-foreground">Loading metrics...</div>;
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const cpu = metrics.cpu;
  const mem = metrics.memory;
  const network = metrics.network;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* CPU Details */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">CPU</h3>
          <span className="text-lg font-mono text-primary">{cpu?.percent?.toFixed(1)}%</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Model</span>
            <span className="text-foreground truncate max-w-[180px]" title={cpu?.model}>{cpu?.model?.substring(0, 30)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cores</span>
            <span className="text-foreground">{cpu?.cores}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Speed</span>
            <span className="text-foreground">{cpu?.speed} GHz</span>
          </div>
          {cpu?.usage && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">User</span>
                <span className="text-foreground">{cpu.usage.user?.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">System</span>
                <span className="text-foreground">{cpu.usage.system?.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Idle</span>
                <span className="text-foreground">{cpu.usage.idle?.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">I/O Wait</span>
                <span className="text-foreground">{cpu.usage.iowait?.toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>
        <div className="mt-3">
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${cpu?.percent || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Memory Details */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Memory</h3>
          <span className="text-lg font-mono text-warning">{mem?.percent?.toFixed(1)}%</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-foreground">{formatBytes(mem?.total || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Used</span>
            <span className="text-foreground">{formatBytes(mem?.used || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Free</span>
            <span className="text-foreground">{formatBytes(mem?.free || 0)}</span>
          </div>
          {mem?.usage && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="text-foreground">{formatBytes(mem.usage.available || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buffers</span>
                <span className="text-foreground">{formatBytes(mem.usage.buffers || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cached</span>
                <span className="text-foreground">{formatBytes(mem.usage.cached || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Swap</span>
                <span className="text-foreground">{mem.usage.swapPercent?.toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>
        <div className="mt-3">
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-warning rounded-full transition-all duration-500"
              style={{ width: `${mem?.percent || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Network Details */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Network</h3>
          <span className="text-xs text-muted-foreground">{network?.interface}</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Downloaded</span>
            <span className="text-foreground">{formatBytes(network?.usage?.totalRx || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Uploaded</span>
            <span className="text-foreground">{formatBytes(network?.usage?.totalTx || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Download Speed</span>
            <span className="text-foreground">{formatBytes(network?.rxSec || 0)}/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Upload Speed</span>
            <span className="text-foreground">{formatBytes(network?.txSec || 0)}/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Packets In</span>
            <span className="text-foreground">{(network?.usage?.packetsRx || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Packets Out</span>
            <span className="text-foreground">{(network?.usage?.packetsTx || 0).toLocaleString()}</span>
          </div>
          {(network?.usage?.errorsRx > 0 || network?.usage?.errorsTx > 0) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Errors</span>
              <span className="text-error">{(network?.usage?.errorsRx || 0) + (network?.usage?.errorsTx || 0)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricChart({ metric, label, color, unit, period }: { metric: string; label: string; color: string; unit: string; period: Period }) {
  const { data } = useQuery({
    queryKey: ['metrics', metric, period],
    queryFn: () => apiClient.get(`/monitoring/history?metric=${metric}&period=${period}`).then((r) => r.data as MetricHistoryDto[]),
    refetchInterval: 30000,
  });
  const points = (data ?? []).map((h) => ({ timestamp: h.timestamp, value: h.value }));
  const latest = points[points.length - 1]?.value;
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">{label} ({period})</h3>
        <span className="text-sm font-mono text-muted-foreground">
          {latest != null ? `${latest.toFixed(1)}${unit}` : '—'}
        </span>
      </div>
      <SparklineChart data={points} color={color} unit={unit} height={120} />
    </div>
  );
}

function DependenciesSection() {
  const qc = useQueryClient();
  const { data: deps, isLoading } = useQuery({
    queryKey: ['dependencies'],
    queryFn: () => apiClient.get('/server/dependencies').then((r) => r.data),
  });

  const installDep = useMutation({
    mutationFn: (name: string) => apiClient.post(`/server/dependencies/${name}/install`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dependencies'] }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Checking dependencies...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">System Dependencies</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {deps?.os} • {deps?.arch}
            </p>
          </div>
          {deps?.allMet ? (
            <span className="px-2 py-1 text-xs rounded bg-success/10 text-success">All OK</span>
          ) : (
            <span className="px-2 py-1 text-xs rounded bg-error/10 text-error">Missing: {deps?.criticalMissing?.join(', ')}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(deps?.dependencies || []).map((dep: any) => (
          <div key={dep.name} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{dep.name}</p>
                {dep.version && <p className="text-xs text-muted-foreground font-mono">{dep.version}</p>}
              </div>
              <div className="flex items-center gap-2">
                {dep.installed ? (
                  <span className="px-2 py-1 text-xs rounded bg-success/10 text-success">OK</span>
                ) : (
                  <button
                    onClick={() => installDep.mutate(dep.name)}
                    disabled={installDep.isPending}
                    className="px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {installDep.isPending ? 'Installing...' : 'Install'}
                  </button>
                )}
              </div>
            </div>
            {!dep.installed && dep.required && (
              <p className="text-xs text-error mt-2">Required • Run: <code className="text-xs">{dep.installCommand}</code></p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppsMonitoring() {
  const { data: apps } = useQuery({
    queryKey: ['monitoring-apps'],
    queryFn: () => apiClient.get('/monitoring/apps').then((r) => r.data as any[]),
    refetchInterval: 30000,
  });

  const { data: processes } = useQuery({
    queryKey: ['pm2-processes'],
    queryFn: () => apiClient.get('/pm2/list').then((r) => r.data as any[]),
    refetchInterval: 10000,
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes) + 1) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getProcessForApp = (pm2Name: string) => {
    return processes?.find((p: any) => p.name === pm2Name);
  };

  if (!apps) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (apps.length === 0) return <p className="text-sm text-muted-foreground">No applications configured.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Each application is probed every 60s via its health URL. Alert on response time or downtime from the Alerts tab.
      </p>

      {processes && processes.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">PM2 Process Resources</h3>
            <p className="text-xs text-muted-foreground">Real-time CPU and memory usage by PM2 process</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-muted-foreground px-4 py-3">Process</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-3">CPU %</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-3">Memory</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-3">Restarts</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-3">Uptime</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p: any) => (
                  <tr key={p.name} className="border-b border-border/50 last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${p.pm2_env?.status === 'online' ? 'bg-success' : 'bg-error'}`} />
                        <span className="text-sm font-medium text-foreground">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono ${p.cpu > 80 ? 'text-error' : p.cpu > 50 ? 'text-warning' : 'text-foreground'}`}>
                          {p.cpu?.toFixed(1) || 0}%
                        </span>
                        <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${p.cpu > 80 ? 'bg-error' : p.cpu > 50 ? 'bg-warning' : 'bg-primary'}`}
                            style={{ width: `${Math.min(p.cpu || 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className="text-sm font-mono text-foreground">
                          {formatBytes(p.memory || 0)}
                        </span>
                        <div className="w-16 h-1 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min((p.memory / (p.monit?.memory || 1)) * 100 || 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        p.pm2_env?.status === 'online' ? 'bg-success/10 text-success' :
                        p.pm2_env?.status === 'stopped' ? 'bg-error/10 text-error' :
                        'bg-warning/10 text-warning'
                      }`}>
                        {p.pm2_env?.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {p.pm2_env?.restart_time || 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.pm2_env?.node_version ? formatUptime(p.pm2_env?.pm_uptime) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {apps.map((a) => (
          <AppMetricCard key={a.pm2Name} app={a} process={getProcessForApp(a.pm2Name)} />
        ))}
      </div>
    </div>
  );
}

function formatUptime(pmUpTime: number): string {
  if (!pmUpTime) return '—';
  const seconds = Math.floor((Date.now() - pmUpTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function AppMetricCard({ app, process }: { app: any; process?: any }) {
  const h = app.health;
  const status = !h ? 'unknown' : h.healthy ? 'UP' : (h.consecutiveFailures >= 3 ? 'DOWN' : 'DEGRADED');
  const statusColor = status === 'UP' ? 'text-success' : status === 'DEGRADED' ? 'text-warning' : status === 'DOWN' ? 'text-error' : 'text-muted-foreground';

  const { data: resptime } = useQuery({
    queryKey: ['app-resptime', app.pm2Name],
    queryFn: () => apiClient.get(`/monitoring/app/${app.pm2Name}/history?metric=resptime&period=1h`).then((r) => r.data as MetricHistoryDto[]),
    refetchInterval: 30000,
  });
  const points = (resptime ?? []).map((p) => ({ timestamp: p.timestamp, value: p.value }));

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes) + 1) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{app.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{app.pm2Name}</p>
        </div>
        <div className="flex items-center gap-3">
          {process && (
            <div className="text-right">
              <span className={`text-xs font-mono ${process.cpu > 80 ? 'text-error' : process.cpu > 50 ? 'text-warning' : 'text-foreground'}`}>
                CPU: {process.cpu?.toFixed(1) || 0}%
              </span>
              <p className="text-xs text-muted-foreground">
                MEM: {formatBytes(process.memory || 0)}
              </p>
            </div>
          )}
          <div className="text-right">
            <span className={`text-xs font-medium ${statusColor}`}>{status}</span>
            <p className="text-xs text-muted-foreground">{h ? `${h.uptimePercent}% uptime` : '—'}</p>
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Response time (1h)</p>
        <SparklineChart data={points} color="#3b82f6" unit=" ms" height={64} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{app.domain ? `https://${app.domain}` : '—'}</span>
        <span>last: {h?.responseTimeMs != null ? `${h.responseTimeMs}ms` : '—'}</span>
      </div>
    </div>
  );
}

function AlertsSection({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [scope, setScope] = useState<'server' | 'app'>('server');
  const [serverMetric, setServerMetric] = useState('cpu');
  const { data: apps = [] } = useQuery({
    queryKey: ['monitoring-apps'],
    queryFn: () => apiClient.get('/monitoring/apps').then((r) => r.data as any[]),
  });
  const [appName, setAppName] = useState('');
  const [appMetric, setAppMetric] = useState<'resptime' | 'down'>('resptime');
  const [form, setForm] = useState({ name: '', operator: 'gt', threshold: '80', durationSeconds: '60', severity: 'WARNING' as 'INFO' | 'WARNING' | 'CRITICAL' });

  const create = useMutation({
    mutationFn: () => {
      const metric = scope === 'server'
        ? serverMetric
        : `app:${appName}:${appMetric}`;
      return apiClient.post('/monitoring/alerts', {
        name: form.name,
        metric,
        appName: scope === 'app' ? appName : null,
        operator: form.operator,
        threshold: Number(form.threshold),
        durationSeconds: Number(form.durationSeconds) || 60,
        severity: form.severity,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      setForm({ name: '', operator: 'gt', threshold: '80', durationSeconds: '60', severity: 'WARNING' });
    },
  });

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">New alert rule</h3>
        <div className="flex gap-2">
          {(['server', 'app'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${scope === s ? 'bg-primary/10 text-primary border-primary/20' : 'bg-surface-2 text-muted-foreground border-border'}`}
            >
              {s === 'server' ? 'Server metric' : 'Application metric'}
            </button>
          ))}
        </div>

        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="rule name (e.g. High CPU)" className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scope === 'server' ? (
            <select value={serverMetric} onChange={(e) => setServerMetric(e.target.value)} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border">
              <option value="cpu">CPU usage (%)</option>
              <option value="ram">Memory usage (%)</option>
              <option value="disk">Disk usage (%)</option>
              <option value="network">Network in (B/s)</option>
            </select>
          ) : (
            <>
              <select value={appName} onChange={(e) => setAppName(e.target.value)} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border">
                <option value="">— select app —</option>
                {apps.map((a) => <option key={a.pm2Name} value={a.pm2Name}>{a.name}</option>)}
              </select>
              <select value={appMetric} onChange={(e) => setAppMetric(e.target.value as 'resptime' | 'down')} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border">
                <option value="resptime">Response time (ms)</option>
                <option value="down">Down (1=down, 0=up)</option>
              </select>
            </>
          )}
          <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border">
            {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} placeholder="threshold" type="number" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <input value={form.durationSeconds} onChange={(e) => setForm({ ...form, durationSeconds: e.target.value })} placeholder="duration (seconds)" type="number" className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border" />
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as any })} className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border">
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-end">
          <button
            onClick={() => create.mutate()}
            disabled={!form.name || (scope === 'app' && !appName) || create.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create rule'}
          </button>
        </div>
        {create.isError && <p className="text-xs text-error">{(create.error as any)?.response?.data?.message || 'Failed to create rule'}</p>}
      </div>

      <RulesList qc={qc} />
      <EventsList />
    </div>
  );
}

function RulesList({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: alertRules } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => apiClient.get('/monitoring/alerts').then((r) => r.data as any[]),
  });
  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => apiClient.patch(`/monitoring/alerts/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/monitoring/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  return (
    <div className="bg-surface border border-border rounded-xl">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Alert Rules</h2>
      </div>
      <div className="divide-y divide-border/50">
        {(alertRules ?? []).map((rule) => (
          <div key={rule.id} className="flex items-center justify-between px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                {rule.appName ? `${rule.appName} • ` : ''}{rule.metric} {OPERATORS.find((o) => o.value === rule.operator)?.label} {rule.threshold} for {rule.durationSeconds}s
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded border ${
                rule.severity === 'CRITICAL' ? 'bg-error/10 text-error border-error/20' :
                rule.severity === 'WARNING' ? 'bg-warning/10 text-warning border-warning/20' :
                'bg-info/10 text-info border-info/20'
              }`}>{rule.severity}</span>
              <button
                onClick={() => toggleRule.mutate({ id: rule.id, enabled: !rule.enabled })}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${rule.enabled ? 'bg-success/10 text-success border-success/20 hover:bg-success/20' : 'bg-muted text-muted-foreground border-border hover:bg-surface-2'}`}
              >{rule.enabled ? 'Enabled' : 'Disabled'}</button>
              <button onClick={() => deleteRule.mutate(rule.id)} className="text-xs text-muted-foreground hover:text-error transition-colors">Remove</button>
            </div>
          </div>
        ))}
        {!alertRules?.length && <p className="text-sm text-muted-foreground px-5 py-8 text-center">No alert rules configured</p>}
      </div>
    </div>
  );
}

function EventsList() {
  const { data: alertEvents } = useQuery({
    queryKey: ['alert-events'],
    queryFn: () => apiClient.get('/monitoring/events?limit=50').then((r) => r.data as any[]),
  });
  if (!alertEvents?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-xl">
      <div className="px-5 py-4 border-b border-border"><h2 className="text-sm font-semibold text-foreground">Recent Alerts</h2></div>
      <div className="divide-y divide-border/50">
        {alertEvents.slice(0, 10).map((e) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm text-foreground">{e.rule?.name}</p>
              <p className="text-xs text-muted-foreground">Value: {e.value.toFixed(2)}</p>
            </div>
            <p className="text-xs text-muted-foreground">{new Date(e.triggeredAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContainersMonitoring() {
  const { data: containers, isLoading } = useQuery({
    queryKey: ['container-stats'],
    queryFn: () => apiClient.get('/docker/containers/stats').then((r) => r.data as any[]),
    refetchInterval: 10000,
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes) + 1) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const sortedContainers = [...(containers || [])].sort((a, b) =>
    (b.stats?.cpuPercent || 0) - (a.stats?.cpuPercent || 0)
  );

  const topCpuContainer = sortedContainers[0];
  const topMemContainer = [...(containers || [])].sort((a, b) =>
    (b.stats?.memoryPercent || 0) - (a.stats?.memoryPercent || 0)
  )[0];
  const topNetworkContainer = [...(containers || [])].sort((a, b) =>
    ((b.stats?.networkRx || 0) + (b.stats?.networkTx || 0)) - ((a.stats?.networkRx || 0) + (a.stats?.networkTx || 0))
  )[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Top CPU</h3>
            <span className="text-xs text-muted-foreground">{topCpuContainer?.stats?.cpuPercent?.toFixed(1) || 0}%</span>
          </div>
          <p className="text-xs text-muted-foreground truncate" title={topCpuContainer?.containerName}>
            {topCpuContainer?.containerName || '—'}
          </p>
          <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.min(topCpuContainer?.stats?.cpuPercent || 0, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Top Memory</h3>
            <span className="text-xs text-muted-foreground">{topMemContainer?.stats?.memoryPercent?.toFixed(1) || 0}%</span>
          </div>
          <p className="text-xs text-muted-foreground truncate" title={topMemContainer?.containerName}>
            {topMemContainer?.containerName || '—'}
          </p>
          <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-warning rounded-full"
              style={{ width: `${Math.min(topMemContainer?.stats?.memoryPercent || 0, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Top Network</h3>
            <span className="text-xs text-muted-foreground">
              {formatBytes((topNetworkContainer?.stats?.networkRx || 0) + (topNetworkContainer?.stats?.networkTx || 0))}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate" title={topNetworkContainer?.containerName}>
            {topNetworkContainer?.containerName || '—'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-success">↓ {formatBytes(topNetworkContainer?.stats?.networkRx || 0)}</span>
            <span className="text-xs text-primary">↑ {formatBytes(topNetworkContainer?.stats?.networkTx || 0)}</span>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Container Resources</h3>
          <p className="text-xs text-muted-foreground">Real-time CPU, memory, and network usage per container</p>
        </div>

        {isLoading && <div className="p-8 text-center text-muted-foreground">Loading containers...</div>}

        {!isLoading && (!containers || containers.length === 0) && (
          <div className="p-8 text-center text-muted-foreground">
            No running containers found.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground px-4 py-3">Container</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-3">CPU %</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-3">Memory</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-3">Network I/O</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-3">Block I/O</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-3">PIDs</th>
              </tr>
            </thead>
            <tbody>
              {(containers || []).map((c: any) => (
                <tr key={c.containerId} className="border-b border-border/50 last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${c.stats?.cpuPercent > 80 ? 'bg-error' : c.stats?.cpuPercent > 50 ? 'bg-warning' : 'bg-success'}`} />
                      <span className="text-sm font-medium text-foreground truncate max-w-[150px]" title={c.containerName}>
                        {c.containerName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-mono ${c.stats?.cpuPercent > 80 ? 'text-error' : c.stats?.cpuPercent > 50 ? 'text-warning' : 'text-foreground'}`}>
                        {c.stats?.cpuPercent?.toFixed(1) || 0}%
                      </span>
                      <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.stats?.cpuPercent > 80 ? 'bg-error' : c.stats?.cpuPercent > 50 ? 'bg-warning' : 'bg-success'}`}
                          style={{ width: `${Math.min(c.stats?.cpuPercent || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <span className="text-sm font-mono text-foreground">
                        {formatBytes(c.stats?.memoryUsage || 0)}
                      </span>
                      <div className="w-16 h-1 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.stats?.memoryPercent > 80 ? 'bg-error' : c.stats?.memoryPercent > 50 ? 'bg-warning' : 'bg-primary'}`}
                          style={{ width: `${Math.min(c.stats?.memoryPercent || 0, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {c.stats?.memoryPercent?.toFixed(0) || 0}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-success">↓ {formatBytes(c.stats?.networkRx || 0)}</span>
                      <span className="text-primary">↑ {formatBytes(c.stats?.networkTx || 0)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    <div>R: {formatBytes(c.stats?.blockRead || 0)}</div>
                    <div>W: {formatBytes(c.stats?.blockWrite || 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.stats?.pids || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
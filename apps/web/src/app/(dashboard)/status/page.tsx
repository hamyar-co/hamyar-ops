'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type {
  SystemStatusDto,
  SystemAppStatusDto,
  AppIncidentDto,
  StatusOverviewDto,
} from '@hamyar-ops/shared';
import { formatDate } from '@/lib/format';

type Period = 'live' | 'hourly' | 'daily' | 'monthly';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'hourly', label: 'Hourly (24h)' },
  { value: 'daily', label: 'Daily (30d)' },
  { value: 'monthly', label: 'Monthly (12m)' },
];

function OverallBadge({ overall }: { overall: SystemStatusDto['overall'] }) {
  const config: Record<string, { label: string; color: string }> = {
    operational: { label: 'All Systems Operational', color: 'bg-success/10 text-success border-success/20' },
    degraded: { label: 'Degraded Performance', color: 'bg-warning/10 text-warning border-warning/20' },
    partial_outage: { label: 'Partial Outage', color: 'bg-warning/10 text-warning border-warning/20' },
    major_outage: { label: 'Major Outage', color: 'bg-error/10 text-error border-error/20' },
  };
  const c = config[overall] ?? config.major_outage;
  return (
    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${c.color}`}>
      <span className={`w-2 h-2 rounded-full ${overall === 'operational' ? 'bg-success animate-pulse' : 'bg-error'}`} />
      {c.label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    UP: 'bg-success', DOWN: 'bg-error', DEGRADED: 'bg-warning',
  };
  return <span className={`w-2 h-2 rounded-full inline-block ${colors[status] ?? 'bg-muted'}`} />;
}

function uptimeColor(p: number) {
  if (p >= 99) return 'bg-success';
  if (p >= 90) return 'bg-warning';
  return 'bg-error';
}

// Vertical bars chart: one bar per bucket, height = uptime%, colored by level
function UptimeBars({ overview }: { overview: StatusOverviewDto }) {
  const buckets = overview.buckets;
  if (!buckets.length) return <p className="text-sm text-muted-foreground py-6 text-center">No history for this period yet.</p>;
  return (
    <div className="flex items-end gap-1 h-44 mt-4 border-b border-border/20 pb-1">
      {buckets.map((b: any, i) => {
        const hasData = b.hasData;
        const uptime = b.overallUptime;
        const colorClass = hasData ? uptimeColor(uptime) : 'bg-muted/15 border border-dashed border-border/30';
        const heightPercent = hasData ? Math.max(uptime, 4) : 8;
        const titleText = hasData ? `${b.label} • ${uptime}% uptime` : `${b.label} • No data`;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group relative h-full">
            <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 whitespace-nowrap bg-surface-2 border border-border px-1.5 py-0.5 rounded shadow-lg z-10 font-mono">
              {hasData ? `${uptime}%` : 'No data'}
            </span>
            <div
              className={`w-full rounded-t ${colorClass} transition-all hover:opacity-80`}
              style={{ height: `${heightPercent}%` }}
              title={titleText}
            />
          </div>
        );
      })}
    </div>
  );
}

// Per-app sparkline-style row of buckets
function AppBucketRow({ overview, appName }: { overview: StatusOverviewDto; appName: string }) {
  return (
    <div className="flex gap-0.5 h-6 ml-2 items-center">
      {overview.buckets.map((b: any, i) => {
        const hasData = b.hasData;
        const v = b.apps[appName];
        const colorClass = hasData && v !== undefined ? uptimeColor(v) : 'bg-muted/10 border border-dashed border-border/20';
        const titleText = hasData && v !== undefined ? `${b.label}  •  ${v}% uptime` : `${b.label}  •  No data`;
        return (
          <div
            key={i}
            className={`flex-1 h-full rounded-sm ${colorClass} transition-colors cursor-help min-w-[3px]`}
            title={titleText}
          />
        );
      })}
    </div>
  );
}

function IncidentCard({ incident }: { incident: AppIncidentDto }) {
  const [expanded, setExpanded] = useState(false);
  const duration = incident.durationMs
    ? `${Math.floor(incident.durationMs / 60000)}m ${Math.floor((incident.durationMs % 60000) / 1000)}s`
    : 'Ongoing';
  return (
    <div className="bg-surface-2 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={incident.status} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{incident.title}</p>
            <p className="text-xs text-muted-foreground">{incident.appName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded ${
            incident.status === 'DOWN' ? 'bg-error/10 text-error' :
            incident.status === 'DEGRADED' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
          }`}>{incident.status}</span>
          <span className="text-xs text-muted-foreground">{duration}</span>
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground hover:text-foreground">{expanded ? '▲' : '▼'}</button>
        </div>
      </div>
      {incident.description && <p className="text-xs text-muted-foreground">{incident.description}</p>}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Started: {formatDate(incident.startedAt)}</span>
        {incident.resolvedAt && <span>Resolved: {formatDate(incident.resolvedAt)}</span>}
      </div>
      {expanded && incident.events.length > 0 && (
        <div className="mt-2 space-y-1 pl-4 border-l-2 border-border">
          {incident.events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 text-xs">
              <StatusDot status={ev.status} />
              <span className="text-muted-foreground">{ev.message ?? ev.status}</span>
              <span className="text-muted-foreground/60 ml-auto">{formatDate(ev.recordedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  const [period, setPeriod] = useState<Period>('hourly');
  const [incidentFilter, setIncidentFilter] = useState('all');

  const { data: status, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => apiClient.get('/status').then((r) => r.data as SystemStatusDto),
    refetchInterval: 30000,
  });

  const { data: overview } = useQuery({
    queryKey: ['status-overview', period],
    queryFn: () => apiClient.get(`/status/overview?period=${period}`).then((r) => r.data as StatusOverviewDto),
    refetchInterval: period === 'live' ? 10000 : 60000,
  });

  const { data: incidents } = useQuery({
    queryKey: ['status-incidents'],
    queryFn: () => apiClient.get('/status/incidents?limit=50').then((r) => r.data as AppIncidentDto[]),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading status…</p></div>;
  }

  const summary = status?.summary;
  const filteredIncidents = incidentFilter === 'all' ? (incidents ?? []) : (incidents ?? []).filter((i) => i.appName === incidentFilter);

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="text-center space-y-3 py-8">
        <h1 className="text-3xl font-bold text-foreground">System Status</h1>
        {status && <OverallBadge overall={status.overall} />}
        <p className="text-sm text-muted-foreground">Last updated: {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : '—'}</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{summary.total}</p><p className="text-xs text-muted-foreground mt-1">Total Apps</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-success">{summary.operational}</p><p className="text-xs text-muted-foreground mt-1">Operational</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-warning">{summary.degraded}</p><p className="text-xs text-muted-foreground mt-1">Degraded</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-error">{summary.down}</p><p className="text-xs text-muted-foreground mt-1">Down</p>
          </div>
        </div>
      )}

      {/* Uptime chart with period selector */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Uptime history</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {overview ? `${overview.daysOfHistory} day(s) of live history available • overall ${overview.overallUptime}% uptime` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${period === p.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >{p.label}</button>
            ))}
          </div>
        </div>
        {overview && <UptimeBars overview={overview} />}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-success" /> ≥99%</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warning" /> 90–99%</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-error" /> &lt;90%</span>
          <span className="ml-auto">{overview?.buckets.length ?? 0} buckets</span>
        </div>
      </div>

      {/* Per-app status with bucket bars */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Applications</h2>
        </div>
        <div className="divide-y divide-border/50">
          {status?.apps.map((app: SystemAppStatusDto) => (
            <div key={app.appName} className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={app.status} />
                  <span className="text-sm font-medium text-foreground">{app.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{app.appName}</span>
                </div>
                <div className="flex items-center gap-3">
                  {app.responseTimeMs !== null && <span className="text-xs text-muted-foreground">{app.responseTimeMs}ms</span>}
                  <span className={`text-xs font-medium ${app.status === 'UP' ? 'text-success' : app.status === 'DEGRADED' ? 'text-warning' : 'text-error'}`}>
                    {overview?.perAppUptime?.[app.appName] ?? app.uptimePercent}% uptime
                  </span>
                </div>
              </div>
              {overview && <AppBucketRow overview={overview} appName={app.appName} />}
              {app.activeIncident && (<div className="mt-2"><IncidentCard incident={app.activeIncident} /></div>)}
            </div>
          ))}
          {status?.apps.length === 0 && <p className="text-sm text-muted-foreground px-5 py-8 text-center">No applications configured</p>}
        </div>
      </div>

      {/* Incident History */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Incident History</h2>
          <select value={incidentFilter} onChange={(e) => setIncidentFilter(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 border border-border text-foreground">
            <option value="all">All Apps</option>
            {status?.apps.map((app) => (<option key={app.appName} value={app.appName}>{app.name}</option>))}
          </select>
        </div>
        <div className="p-5 space-y-3">
          {filteredIncidents.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No incidents recorded</p>}
          {filteredIncidents.map((incident) => (<IncidentCard key={incident.id} incident={incident} />))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">Status updates every 30 seconds</p>
    </div>
  );
}
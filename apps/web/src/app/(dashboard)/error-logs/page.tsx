'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

type Bucket = '1h' | '12h' | '24h' | 'daily' | 'weekly' | 'monthly' | 'yearly';
const BUCKETS: { value: Bucket; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
  { value: 'daily', label: 'Daily (30d)' },
  { value: 'weekly', label: 'Weekly (12w)' },
  { value: 'monthly', label: 'Monthly (12m)' },
  { value: 'yearly', label: 'Yearly (5y)' },
];

function barColor(count: number, max: number) {
  if (count === 0) return 'bg-surface-2';
  const ratio = count / (max || 1);
  if (ratio > 0.66) return 'bg-error';
  if (ratio > 0.33) return 'bg-warning';
  return 'bg-info';
}

export default function ErrorLogsPage() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<Bucket>('24h');
  const [groupBy, setGroupBy] = useState<'all' | 'source' | 'app'>('all');
  const [selectedFp, setSelectedFp] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['error-logs-overview', bucket, groupBy],
    queryFn: () => apiClient.get(`/error-logs?bucket=${bucket}`).then((r) => r.data as any),
    refetchInterval: 30000,
  });

  const scan = useMutation({
    mutationFn: () => apiClient.post('/error-logs/scan'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['error-logs-overview'] }),
  });

  const maxTotal = Math.max(1, ...(data?.totals ?? [0]));
  const fingerprints = (data?.fingerprints ?? []) as any[];
  const bySource = (data?.bySource ?? {}) as Record<string, number[]>;
  const appNames = Object.keys(bySource).sort();
  const current = fingerprints.find((f) => f.fingerprint === selectedFp);
  const currentRecent = (data?.recent ?? []).filter((r: any) => r.fingerprint === selectedFp);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Error Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centralized error aggregator — scans PM2, Nginx & Docker logs and groups by app/container, route & time.
          </p>
        </div>
        <button
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {scan.isPending ? 'Scanning…' : 'Scan now'}
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Range:</span>
        <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
          {BUCKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-2">Group:</span>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
          <option value="all">All (combined)</option>
          <option value="source">Per app/container</option>
        </select>
      </div>

      {/* Totals bar chart */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Error volume over time</h3>
          <span className="text-xs text-muted-foreground">{data?.totals.reduce((a: number, b: number) => a + b, 0) ?? 0} errors • {data?.from ? new Date(data.from).toLocaleString() : ''} → {data?.to ? new Date(data.to).toLocaleString() : ''}</span>
        </div>
        <div className="flex items-end gap-1 h-32">
          {(data?.labels ?? []).map((label: string, i: number) => {
            const v = data?.totals[i] ?? 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                <div
                  className={`w-full rounded-t ${barColor(v, maxTotal)} transition-all hover:opacity-80 ${v === 0 ? 'opacity-30' : ''}`}
                  style={{ height: `${Math.max((v / maxTotal) * 100, 2)}%` }}
                  title={`${label}: ${v} errors`}
                />
                {i % Math.ceil((data?.labels.length || 1) / 8) === 0 && (
                  <span className="text-[9px] text-muted-foreground rotate-45 origin-left">{label}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-app/container breakdown */}
      {groupBy === 'source' && appNames.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Per app / container</h3>
          <div className="space-y-3">
            {appNames.map((name) => {
              const arr = bySource[name];
              const total = arr.reduce((a, b) => a + b, 0);
              const localMax = Math.max(1, ...arr);
              return (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-foreground truncate">{name}</span>
                    <span className="text-muted-foreground">{total}</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-8">
                    {arr.map((v, i) => (
                      <div key={i} className={`flex-1 rounded-sm min-w-[2px] ${barColor(v, localMax)} ${v === 0 ? 'opacity-30' : ''}`} style={{ height: `${Math.max((v / localMax) * 100, 4)}%` }} title={`${data?.labels[i]}: ${v}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fingerprint (grouped titles) list */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Grouped errors ({fingerprints.length})</h3>
        </div>
        <div className="divide-y divide-border/50 max-h-[460px] overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground px-4 py-6 text-center">Loading…</p>}
          {!isLoading && fingerprints.length === 0 && <p className="text-sm text-muted-foreground px-4 py-6 text-center">No errors detected in this range 🎉</p>}
          {fingerprints.map((f) => (
            <button
              key={f.fingerprint}
              onClick={() => setSelectedFp(selectedFp === f.fingerprint ? null : f.fingerprint)}
              className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{f.sourceName}</span>
                    {f.route && <> • <span className="font-mono">{f.route}</span></>}
                    {' • '}first {new Date(f.firstAt).toLocaleString()} • last {new Date(f.lastAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-error/10 text-error shrink-0">{f.count}×</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected error detail */}
      {current && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Detail: {current.title}</h3>
            <span className="text-xs text-muted-foreground">{current.count} occurrences</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3 font-mono">{current.source}/{current.sourceName} {current.route ? `• ${current.route}` : ''}</p>
          <div className="bg-black/40 rounded-lg p-3 font-mono text-xs space-y-1 max-h-72 overflow-y-auto">
            {currentRecent.map((r: any, i: number) => (
              <div key={i} className="whitespace-pre-wrap break-all text-error/80">
                <span className="text-muted-foreground/70">{new Date(r.timestamp).toLocaleString()} </span>{r.fullLine}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
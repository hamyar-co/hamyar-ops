'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { MetricCard } from '@/components/charts/MetricCard';
import { SparklineChart } from '@/components/charts/SparklineChart';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ServerMetricsDto, PM2ProcessDto } from '@hamyar-ops/shared';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatBytes, formatUptime } from '@/lib/format';
import { Card, Grid, ScrollableWidget } from '@/components/layout/ResponsiveComponents';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<ServerMetricsDto | null>(null);
  const [processes, setProcesses] = useState<PM2ProcessDto[]>([]);
  const { socket } = useSocket();

  const { data: initialMetrics } = useQuery({
    queryKey: ['server-metrics'],
    queryFn: () => apiClient.get('/server/metrics').then((r) => r.data as ServerMetricsDto),
    refetchInterval: 30000,
  });

  const { data: initialProcesses } = useQuery({
    queryKey: ['pm2-processes'],
    queryFn: () => apiClient.get('/pm2/processes').then((r) => r.data as PM2ProcessDto[]),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (initialMetrics) setMetrics(initialMetrics);
  }, [initialMetrics]);

  useEffect(() => {
    if (initialProcesses) setProcesses(initialProcesses);
  }, [initialProcesses]);

  useEffect(() => {
    if (!socket) return;
    socket.on(WsEvents.SERVER_METRICS, setMetrics);
    socket.on(WsEvents.PM2_STATUS, setProcesses);
    socket.emit(WsEvents.SUBSCRIBE, { topics: ['pm2', 'server'] });
    return () => {
      socket.off(WsEvents.SERVER_METRICS, setMetrics);
      socket.off(WsEvents.PM2_STATUS, setProcesses);
      socket.emit(WsEvents.UNSUBSCRIBE, { topics: ['pm2', 'server'] });
    };
  }, [socket]);

  const onlineCount = processes.filter((p) => p.status === 'online').length;
  const stoppedCount = processes.filter((p) => p.status === 'stopped').length;
  const erroredCount = processes.filter((p) => p.status === 'errored').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Real-time server status</p>
      </div>

      {/* Metric Cards */}
      <Grid cols={2} className="sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="CPU Usage"
          value={`${metrics?.cpu.percent ?? 0}%`}
          subtitle={metrics?.cpu.model ?? ''}
          color="info"
          percent={metrics?.cpu.percent ?? 0}
        />
        <MetricCard
          title="Memory"
          value={`${metrics?.memory.percent ?? 0}%`}
          subtitle={metrics ? `${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}` : ''}
          color="warning"
          percent={metrics?.memory.percent ?? 0}
        />
        <MetricCard
          title="Disk"
          value={`${metrics?.disk[0]?.percent ?? 0}%`}
          subtitle={metrics?.disk[0] ? `${formatBytes(metrics.disk[0].used)} / ${formatBytes(metrics.disk[0].size)}` : ''}
          color="success"
          percent={metrics?.disk[0]?.percent ?? 0}
        />
        <MetricCard
          title="Network"
          value={`${formatBytes(metrics?.network.rxSec ?? 0)}/s`}
          subtitle={`↑ ${formatBytes(metrics?.network.txSec ?? 0)}/s`}
          color="accent"
          percent={null}
        />
      </Grid>

      {/* PM2 Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" padding={false}>
          <div className="p-4 sm:p-5 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">PM2 Processes</h2>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="text-success">{onlineCount} online</span>
                <span className="text-muted-foreground">{stoppedCount} stopped</span>
                {erroredCount > 0 && <span className="text-error">{erroredCount} error</span>}
              </div>
            </div>
          </div>
          <ScrollableWidget>
            <div className="divide-y divide-border/50">
              {processes.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <StatusBadge status={p.status} />
                    <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground shrink-0 ml-4">
                    <span className="hidden sm:inline">CPU {p.cpu.toFixed(1)}%</span>
                    <span className="hidden sm:inline">RAM {formatBytes(p.memory)}</span>
                    <span className="hidden md:inline">{formatUptime(p.uptime)}</span>
                  </div>
                </div>
              ))}
              {processes.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No processes</p>
              )}
            </div>
          </ScrollableWidget>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
            {[
              { label: 'PM2', href: '/pm2', icon: '⚡' },
              { label: 'Docker', href: '/docker', icon: '🐳' },
              { label: 'Nginx', href: '/nginx', icon: '🔧' },
              { label: 'Terminal', href: '/terminal', icon: '>' },
              { label: 'Logs', href: '/logs', icon: '📋' },
              { label: 'System', href: '/server', icon: '🖥' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors group"
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
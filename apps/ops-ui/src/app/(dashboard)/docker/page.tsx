'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import type { ContainerDto, ContainerStatsDto } from '@hamyar-ops/shared';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomTabs, TabItem } from '@/components/ui/CustomTabs';
import { CustomModal } from '@/components/ui/CustomModal';

export default function DockerPage() {
  const [containers, setContainers] = useState<ContainerDto[]>([]);
  const [stats, setStats] = useState<Record<string, ContainerStatsDto>>({});
  const [activeTab, setActiveTab] = useState('containers');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [pullImage, setPullImage] = useState('');
  const [selectedContainer, setSelectedContainer] = useState<ContainerDto | null>(null);

  const { socket } = useSocket();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['docker-containers'],
    queryFn: () => apiClient.get('/docker/containers').then((r) => r.data as ContainerDto[]),
    refetchInterval: 15000,
  });

  const { data: images = [] } = useQuery({
    queryKey: ['docker-images'],
    queryFn: () => apiClient.get('/docker/images').then((r) => r.data as any[]),
    enabled: activeTab === 'images',
  });

  const { data: volumes = [] } = useQuery({
    queryKey: ['docker-volumes'],
    queryFn: () => apiClient.get('/docker/volumes').then((r) => r.data as any[]),
    enabled: activeTab === 'volumes',
  });

  const { data: networks = [] } = useQuery({
    queryKey: ['docker-networks'],
    queryFn: () => apiClient.get('/docker/networks').then((r) => r.data as any[]),
    enabled: activeTab === 'networks',
  });

  useEffect(() => {
    if (data) setContainers(data);
  }, [data]);

  useEffect(() => {
    if (!socket) return;
    const statsHandler = (s: ContainerStatsDto) => {
      setStats((prev) => ({ ...prev, [s.id]: s }));
    };
    const eventHandler = () => {
      qc.invalidateQueries({ queryKey: ['docker-containers'] });
    };

    socket.on(WsEvents.DOCKER_STATS, statsHandler);
    socket.on(WsEvents.DOCKER_EVENT, eventHandler);
    return () => {
      socket.off(WsEvents.DOCKER_STATS, statsHandler);
      socket.off(WsEvents.DOCKER_EVENT, eventHandler);
    };
  }, [socket, qc]);

  const containerAction = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) =>
      apiClient.post(`/docker/containers/${id}/${act}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-containers'] }),
  });

  const removeContainer = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/docker/containers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-containers'] }),
  });

  const pullImageMutation = useMutation({
    mutationFn: (image: string) => apiClient.post('/docker/images/pull', { image }),
    onSuccess: () => { setPullImage(''); qc.invalidateQueries({ queryKey: ['docker-images'] }); },
  });

  // Filtered containers
  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'RUNNING' ? c.state === 'running' : c.state !== 'running');
      return matchesSearch && matchesStatus;
    });
  }, [containers, searchTerm, statusFilter]);

  const runningCount = containers.filter((c) => c.state === 'running').length;
  const stoppedCount = containers.length - runningCount;

  const tabs: TabItem[] = [
    { id: 'containers', label: 'Containers', icon: <span>🐳</span>, badge: containers.length },
    { id: 'images', label: 'Images', icon: <span>📦</span>, badge: images.length },
    { id: 'volumes', label: 'Volumes', icon: <span>💾</span>, badge: volumes.length },
    { id: 'networks', label: 'Networks', icon: <span>🌐</span>, badge: networks.length },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Docker Orchestration</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time monitoring, CPU/Memory telemetry gauges, image pulling, and container lifecycle control.
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Containers</p>
            <p className="text-2xl font-bold text-foreground mt-1">{containers.length}</p>
          </div>
          <span className="text-2xl">🐳</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Running State</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <span className="text-2xl font-bold text-foreground">{runningCount}</span>
            </div>
          </div>
          <span className="text-2xl">▶</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Exited / Stopped</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stoppedCount}</p>
          </div>
          <span className="text-2xl">⏹</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Docker Daemon</p>
            <p className="text-base font-mono font-bold text-foreground mt-1">unix:///var/run/docker.sock</p>
          </div>
          <span className="text-2xl">⚙</span>
        </div>
      </div>

      {/* Tabs Bar */}
      <CustomTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* TAB 1: CONTAINERS */}
      {activeTab === 'containers' && (
        <div className="space-y-4">
          {/* Search & Status Filter */}
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="w-full sm:w-80">
              <CustomInput
                placeholder="🔍 Filter containers by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {['ALL', 'RUNNING', 'STOPPED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    statusFilter === st
                      ? 'bg-primary text-foreground border-primary'
                      : 'bg-surface-2 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Containers Table */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                    <th className="px-5 py-3">Container Name</th>
                    <th className="px-5 py-3">State</th>
                    <th className="px-5 py-3">CPU %</th>
                    <th className="px-5 py-3">RAM Memory</th>
                    <th className="px-5 py-3">Ports</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Loading Docker containers...</td>
                    </tr>
                  ) : filteredContainers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">No containers match search filter</td>
                    </tr>
                  ) : (
                    filteredContainers.map((c) => {
                      const cStats = stats[c.id];
                      const cpu = cStats?.cpuPercent ?? 0;
                      const memoryMb = Math.round((cStats?.memoryUsage ?? 0) / (1024 * 1024));

                      return (
                        <tr key={c.id} className="hover:bg-surface-2/50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <span className="text-base">🐳</span>
                              <div>
                                <p className="font-semibold text-xs text-foreground">{c.name.replace(/^\//, '')}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{c.id.slice(0, 12)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <CustomBadge variant={c.state === 'running' ? 'success' : 'error'}>
                              {c.state}
                            </CustomBadge>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="w-24">
                              <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                                <span>CPU</span>
                                <span>{cpu}%</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all duration-300"
                                  style={{ width: `${Math.min(cpu, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                            {memoryMb > 0 ? `${memoryMb} MB` : '–'}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground truncate max-w-xs">
                            {c.ports?.map((p) => `${p.hostPort ?? p.containerPort}`).join(', ') || 'None'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {c.state === 'running' ? (
                                <CustomButton
                                  size="sm"
                                  variant="outline"
                                  onClick={() => containerAction.mutate({ id: c.id, act: 'stop' })}
                                >
                                  Stop
                                </CustomButton>
                              ) : (
                                <CustomButton
                                  size="sm"
                                  variant="primary"
                                  onClick={() => containerAction.mutate({ id: c.id, act: 'start' })}
                                >
                                  Start
                                </CustomButton>
                              )}
                              <CustomButton
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedContainer(c)}
                              >
                                Inspect
                              </CustomButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: IMAGES */}
      {activeTab === 'images' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
            <CustomInput
              placeholder="e.g. redis:alpine or postgres:16"
              value={pullImage}
              onChange={(e) => setPullImage(e.target.value)}
              className="flex-1"
            />
            <CustomButton
              loading={pullImageMutation.isPending}
              disabled={!pullImage}
              onClick={() => pullImageMutation.mutate(pullImage)}
            >
              Pull Docker Image
            </CustomButton>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-muted-foreground font-semibold">
                  <th className="px-4 py-3">Repository / Tag</th>
                  <th className="px-4 py-3">Image ID</th>
                  <th className="px-4 py-3">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {images.map((img: any) => (
                  <tr key={img.id} className="hover:bg-surface-2/40">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{img.repoTags?.join(', ') || '<none>'}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{img.id?.slice(7, 19)}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{Math.round((img.size || 0) / (1024 * 1024))} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Container Inspection Modal */}
      {selectedContainer && (
        <CustomModal
          isOpen={true}
          onClose={() => setSelectedContainer(null)}
          title={`Inspect Container — ${selectedContainer.name.replace(/^\//, '')}`}
          description={`ID: ${selectedContainer.id}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <pre className="p-4 rounded-xl bg-surface-2 border border-border font-mono text-xs text-foreground overflow-x-auto max-h-96">
              {JSON.stringify(selectedContainer, null, 2)}
            </pre>
            <div className="flex justify-end">
              <CustomButton variant="outline" onClick={() => setSelectedContainer(null)}>Close</CustomButton>
            </div>
          </div>
        </CustomModal>
      )}
    </div>
  );
}

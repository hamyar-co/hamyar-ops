'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import type { PM2ProcessDto } from '@hamyar-ops/shared';
import { formatBytes, formatUptime } from '@/lib/format';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomInput } from '@/components/ui/CustomInput';

export default function PM2Page() {
  const [processes, setProcesses] = useState<PM2ProcessDto[]>([]);
  const [search, setSearch] = useState('');
  const { socket } = useSocket();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['pm2-processes'],
    queryFn: () => apiClient.get('/pm2/processes').then((r) => r.data as PM2ProcessDto[]),
  });

  useEffect(() => {
    if (data) setProcesses(data);
  }, [data]);

  useEffect(() => {
    if (!socket) return;
    socket.on(WsEvents.PM2_STATUS, setProcesses);
    socket.emit(WsEvents.SUBSCRIBE, { topics: ['pm2'] });
    return () => {
      socket.off(WsEvents.PM2_STATUS, setProcesses);
      socket.emit(WsEvents.UNSUBSCRIBE, { topics: ['pm2'] });
    };
  }, [socket]);

  const action = useMutation({
    mutationFn: ({ name, act }: { name: string; act: string }) =>
      apiClient.post(`/pm2/processes/${name}/${act}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pm2-processes'] }),
  });

  const deleteProc = useMutation({
    mutationFn: (name: string) => apiClient.delete(`/pm2/processes/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pm2-processes'] }),
  });

  const save = useMutation({
    mutationFn: () => apiClient.post('/pm2/save'),
  });

  const filteredProcesses = processes.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">PM2 Process Controller</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor Node.js processes, memory limits, restart counters, and process state.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate()} icon={<span>💾</span>}>
            Save State
          </CustomButton>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div className="w-full sm:w-80">
          <CustomInput
            placeholder="🔍 Search process name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <CustomBadge variant="info">{filteredProcesses.length} Processes</CustomBadge>
      </div>

      {/* Process Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Process Name</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">CPU</th>
                <th className="px-5 py-3">RAM</th>
                <th className="px-5 py-3">Restarts</th>
                <th className="px-5 py-3">Uptime</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">Loading PM2 processes...</td>
                </tr>
              ) : filteredProcesses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">No processes match '{search}'</td>
                </tr>
              ) : (
                filteredProcesses.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚡</span>
                        <div>
                          <p className="font-semibold text-xs text-foreground">{p.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground truncate max-w-xs">{p.cwd}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant={p.status === 'online' ? 'success' : 'error'}>
                        {p.status}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-foreground">{p.cpu.toFixed(1)}%</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{formatBytes(p.memory)}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{p.restarts}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{formatUptime(p.uptime)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.status === 'online' ? (
                          <CustomButton
                            size="sm"
                            variant="outline"
                            onClick={() => action.mutate({ name: p.name, act: 'stop' })}
                          >
                            Stop
                          </CustomButton>
                        ) : (
                          <CustomButton
                            size="sm"
                            variant="primary"
                            onClick={() => action.mutate({ name: p.name, act: 'start' })}
                          >
                            Start
                          </CustomButton>
                        )}
                        <CustomButton
                          size="sm"
                          variant="ghost"
                          onClick={() => action.mutate({ name: p.name, act: 'restart' })}
                        >
                          Restart
                        </CustomButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

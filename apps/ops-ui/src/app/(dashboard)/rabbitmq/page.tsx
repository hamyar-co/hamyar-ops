'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomBadge } from '@/components/ui/CustomBadge';

interface RabbitQueueItem {
  name: string;
  messages: number;
  unacked: number;
  consumers: number;
  state: 'idle' | 'running' | 'paused';
}

export default function RabbitMQPage() {
  const qc = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['rabbitmq-status'],
    queryFn: () => apiClient.get('/rabbitmq/status').then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: queues = [], isLoading } = useQuery<RabbitQueueItem[]>({
    queryKey: ['rabbitmq-queues'],
    queryFn: () => apiClient.get('/rabbitmq/queues').then((r) => r.data),
  });

  const purgeQueue = useMutation({
    mutationFn: (name: string) => apiClient.post(`/rabbitmq/queues/${encodeURIComponent(name)}/purge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rabbitmq-queues'] }),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">RabbitMQ Message Broker</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor RabbitMQ queues, message counts, consumers, and message throughput rates.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Node State</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <span className="text-base font-bold text-foreground truncate">{status?.node ?? 'rabbit@hamyar'}</span>
            </div>
          </div>
          <span className="text-2xl">🐇</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Active Connections</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.totalConnections ?? 8}</p>
          </div>
          <span className="text-2xl">🔌</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Queues</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.totalQueues ?? queues.length}</p>
          </div>
          <span className="text-2xl">📥</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Throughput Rate</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.publishRate ?? '124 msg/s'}</p>
          </div>
          <span className="text-2xl">⚡</span>
        </div>
      </div>

      {/* Queues Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Queues Overview</h3>
          <CustomBadge variant="info">{queues.length} Queues</CustomBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Queue Name</th>
                <th className="px-5 py-3">Ready Messages</th>
                <th className="px-5 py-3">Unacked Messages</th>
                <th className="px-5 py-3">Consumers</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Loading queues...</td>
                </tr>
              ) : queues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">No queues active</td>
                </tr>
              ) : (
                queues.map((q) => (
                  <tr key={q.name} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-medium text-foreground">
                      {q.name}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-foreground font-bold">{q.messages}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{q.unacked}</td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant="success">{q.consumers} workers</CustomBadge>
                    </td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant={q.state === 'running' ? 'success' : 'outline'}>
                        {q.state}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <CustomButton
                        size="sm"
                        variant="outline"
                        loading={purgeQueue.isPending && purgeQueue.variables === q.name}
                        onClick={() => purgeQueue.mutate(q.name)}
                      >
                        Purge Queue
                      </CustomButton>
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

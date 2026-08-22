'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomModal } from '@/components/ui/CustomModal';
import { CustomBadge } from '@/components/ui/CustomBadge';

interface RedisKeyItem {
  key: string;
  type: string;
  ttl: number;
  size: string;
}

export default function RedisPage() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('*');
  const [isFlushConfirmOpen, setIsFlushConfirmOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['redis-status'],
    queryFn: () => apiClient.get('/redis/status').then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: keys = [], isLoading } = useQuery<RedisKeyItem[]>({
    queryKey: ['redis-keys', searchTerm],
    queryFn: () => apiClient.get(`/redis/keys?pattern=${encodeURIComponent(searchTerm)}`).then((r) => r.data),
  });

  const deleteKey = useMutation({
    mutationFn: (key: string) => apiClient.delete(`/redis/keys/${encodeURIComponent(key)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redis-keys'] }),
  });

  const flushDb = useMutation({
    mutationFn: () => apiClient.post('/redis/flush'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['redis-keys'] });
      setIsFlushConfirmOpen(false);
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Redis Cache Manager</h1>
          <p className="text-xs text-muted-foreground mt-1">
            View Redis memory metrics, active keys, TTL expiration, and perform key management operations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton variant="danger" size="sm" onClick={() => setIsFlushConfirmOpen(true)} icon={<span>🧹</span>}>
            Flush Redis DB
          </CustomButton>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Used Memory</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.usedMemory ?? '18 MB'}</p>
          </div>
          <span className="text-2xl">⚡</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Keys</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.totalKeys ?? keys.length}</p>
          </div>
          <span className="text-2xl">🔑</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Cache Hit Rate</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.hitRate ?? '98.5%'}</p>
          </div>
          <span className="text-2xl">🎯</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Connected Clients</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.connectedClients ?? 6}</p>
          </div>
          <span className="text-2xl">👥</span>
        </div>
      </div>

      {/* Keys Browser */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Redis Keys</h3>
            <CustomBadge variant="info">{keys.length} loaded</CustomBadge>
          </div>

          <div className="w-full sm:w-64">
            <CustomInput
              placeholder="Search pattern (e.g. session:*)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Key Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">TTL (Seconds)</th>
                <th className="px-5 py-3">Memory Size</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">Loading Redis keys...</td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">No keys matched pattern '{searchTerm}'</td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.key} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-medium text-foreground truncate max-w-xs">
                      {k.key}
                    </td>
                    <td className="px-5 py-3">
                      <CustomBadge variant="outline">{k.type}</CustomBadge>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      {k.ttl < 0 ? 'No Expiry' : `${k.ttl}s`}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{k.size}</td>
                    <td className="px-5 py-3 text-right">
                      <CustomButton
                        size="sm"
                        variant="ghost"
                        className="text-error hover:bg-error/10"
                        loading={deleteKey.isPending && deleteKey.variables === k.key}
                        onClick={() => deleteKey.mutate(k.key)}
                      >
                        Delete
                      </CustomButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flush Confirmation Modal */}
      <CustomModal
        isOpen={isFlushConfirmOpen}
        onClose={() => setIsFlushConfirmOpen(false)}
        title="Flush Redis Database?"
        description="This operation will permanently delete ALL keys stored in the selected Redis database."
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-error font-medium bg-error/10 border border-error/20 p-3 rounded-lg">
            ⚠️ Warning: Flushing Redis cache will clear all active user sessions and cached entries.
          </p>
          <div className="flex justify-end gap-2">
            <CustomButton variant="outline" onClick={() => setIsFlushConfirmOpen(false)}>Cancel</CustomButton>
            <CustomButton variant="danger" loading={flushDb.isPending} onClick={() => flushDb.mutate()}>
              Yes, Flush All Keys
            </CustomButton>
          </div>
        </div>
      </CustomModal>
    </div>
  );
}

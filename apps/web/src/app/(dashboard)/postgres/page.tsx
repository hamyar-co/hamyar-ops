'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomModal } from '@/components/ui/CustomModal';
import { CustomBadge } from '@/components/ui/CustomBadge';

interface DbItem {
  name: string;
  size: string;
  tablesCount: number;
  activeConnections: number;
  encoding: string;
}

export default function PostgresPage() {
  const qc = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isQueryOpen, setIsQueryOpen] = useState(false);
  const [dbName, setDbName] = useState('');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM pg_stat_activity LIMIT 10;');
  const [queryResult, setQueryResult] = useState<any>(null);

  const { data: status } = useQuery({
    queryKey: ['postgres-status'],
    queryFn: () => apiClient.get('/postgres/status').then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: databases = [], isLoading } = useQuery<DbItem[]>({
    queryKey: ['postgres-databases'],
    queryFn: () => apiClient.get('/postgres/databases').then((r) => r.data),
  });

  const createDb = useMutation({
    mutationFn: (name: string) => apiClient.post('/postgres/databases', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['postgres-databases'] });
      setIsCreateOpen(false);
      setDbName('');
    },
  });

  const runQuery = useMutation({
    mutationFn: (query: string) => apiClient.post('/postgres/query', { query }),
    onSuccess: (res) => {
      setQueryResult(res.data);
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">PostgreSQL Manager</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor databases, active connections, storage allocation, and execute SQL queries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton variant="outline" size="sm" onClick={() => setIsQueryOpen(true)} icon={<span>⚡</span>}>
            SQL Query Console
          </CustomButton>
          <CustomButton size="sm" onClick={() => setIsCreateOpen(true)} icon={<span>+</span>}>
            New Database
          </CustomButton>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Server Status</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <span className="text-lg font-bold text-foreground">Connected</span>
            </div>
          </div>
          <span className="text-2xl">🐘</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Active Connections</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.activeConnections ?? 0} / {status?.maxConnections ?? 100}</p>
          </div>
          <span className="text-2xl">🔌</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Database Size</p>
            <p className="text-2xl font-bold text-foreground mt-1">{status?.totalSize ?? '0 MB'}</p>
          </div>
          <span className="text-2xl">💾</span>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">PostgreSQL Version</p>
            <p className="text-base font-mono font-bold text-foreground mt-1 truncate">{status?.version ?? '16.x'}</p>
          </div>
          <span className="text-2xl">⚙</span>
        </div>
      </div>

      {/* Databases Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Databases</h3>
          <CustomBadge variant="info">{databases.length} Databases</CustomBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Database Name</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Tables</th>
                <th className="px-5 py-3">Active Conns</th>
                <th className="px-5 py-3">Encoding</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Loading databases...</td>
                </tr>
              ) : databases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">No PostgreSQL databases found</td>
                </tr>
              ) : (
                databases.map((db) => (
                  <tr key={db.name} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-foreground flex items-center gap-2">
                      <span className="text-base">📁</span>
                      <span>{db.name}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{db.size}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-foreground">{db.tablesCount}</td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant="success">{db.activeConnections} active</CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{db.encoding}</td>
                    <td className="px-5 py-3.5 text-right">
                      <CustomButton
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSqlQuery(`SELECT table_name FROM information_schema.tables WHERE table_schema='public';`);
                          setIsQueryOpen(true);
                        }}
                      >
                        Inspect
                      </CustomButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Database Modal */}
      <CustomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create PostgreSQL Database"
        description="Enter a unique name for the new PostgreSQL database."
      >
        <div className="space-y-4">
          <CustomInput
            label="Database Name"
            placeholder="e.g. hamyar_services"
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <CustomButton variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</CustomButton>
            <CustomButton
              loading={createDb.isPending}
              disabled={!dbName}
              onClick={() => createDb.mutate(dbName)}
            >
              Create Database
            </CustomButton>
          </div>
        </div>
      </CustomModal>

      {/* SQL Query Console Modal */}
      <CustomModal
        isOpen={isQueryOpen}
        onClose={() => setIsQueryOpen(false)}
        title="SQL Console"
        description="Execute custom SQL queries against the active PostgreSQL database instance."
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground/80 mb-1.5 block">SQL Query</label>
            <textarea
              rows={4}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex justify-end gap-2">
            <CustomButton variant="outline" size="sm" onClick={() => setIsQueryOpen(false)}>Close</CustomButton>
            <CustomButton size="sm" loading={runQuery.isPending} onClick={() => runQuery.mutate(sqlQuery)}>Run Query</CustomButton>
          </div>

          {queryResult && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className={queryResult.success ? 'text-success font-semibold' : 'text-error font-semibold'}>
                  {queryResult.success ? `Success (${queryResult.rowsCount} rows)` : 'Execution Failed'}
                </span>
              </div>
              {queryResult.error ? (
                <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-xs font-mono">
                  {queryResult.error}
                </div>
              ) : (
                <pre className="p-3 rounded-lg bg-surface-2 border border-border text-[11px] font-mono text-foreground max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(queryResult.rows, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </CustomModal>
    </div>
  );
}

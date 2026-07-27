'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import type {
  SupervisorRuleDto,
  CreateSupervisorRuleDto,
  UpdateSupervisorRuleDto,
  ManagedServerDto,
} from '@hamyar-ops/shared';

type AppStatus = 'RUNNING' | 'DOWN' | 'RESTARTED' | 'UNKNOWN';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_COLORS: Record<AppStatus, string> = {
  RUNNING: 'bg-success/10 text-success',
  DOWN: 'bg-error/10 text-error',
  RESTARTED: 'bg-warning/10 text-warning',
  UNKNOWN: 'bg-muted/10 text-muted-foreground',
};

const TYPE_COLORS: Record<string, string> = {
  PM2: 'bg-info/10 text-info',
  DOCKER: 'bg-primary/10 text-primary',
  SYSTEMD: 'bg-warning/10 text-warning',
};

const SEVERITY_ICONS: Record<string, string> = {
  INFO: 'ℹ',
  SUCCESS: '✓',
  WARNING: '⚠',
  ERROR: '✕',
};

const SEVERITY_COLORS: Record<string, string> = {
  INFO: 'text-info',
  SUCCESS: 'text-success',
  WARNING: 'text-warning',
  ERROR: 'text-error',
};

export default function SupervisorPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<SupervisorRuleDto | null>(null);
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['supervisor-rules'],
    queryFn: () => apiClient.get('/supervisor').then((r) => r.data as SupervisorRuleDto[]),
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['managed-servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data as ManagedServerDto[]),
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ['supervisor-events'],
    queryFn: () =>
      apiClient
        .get('/events?type=SUPERVISOR&limit=20')
        .then((r) => r.data as { items: any[]; total: number }),
    refetchInterval: 30000,
  });

  // Real-time status updates via WebSocket
  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { rule: SupervisorRuleDto }) => {
      queryClient.setQueryData<SupervisorRuleDto[]>(['supervisor-rules'], (old) => {
        if (!old) return old;
        return old.map((r) => (r.id === payload.rule.id ? payload.rule : r));
      });
    };
    socket.on(WsEvents.SUPERVISOR_STATUS, handler);
    return () => {
      socket.off(WsEvents.SUPERVISOR_STATUS, handler);
    };
  }, [socket, queryClient]);

  const createRule = useMutation({
    mutationFn: (dto: CreateSupervisorRuleDto) => apiClient.post('/supervisor', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-rules'] });
      setShowModal(false);
    },
  });

  const updateRule = useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & UpdateSupervisorRuleDto) =>
      apiClient.put(`/supervisor/${id}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-rules'] });
      setEditingRule(null);
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/supervisor/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supervisor-rules'] }),
  });

  const toggleRule = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/supervisor/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supervisor-rules'] }),
  });

  const checkOne = useMutation({
    mutationFn: (id: string) => apiClient.post(`/supervisor/${id}/check`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supervisor-rules'] }),
  });

  const checkAll = useMutation({
    mutationFn: () => apiClient.post('/supervisor/check-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-rules'] });
      refetchEvents();
    },
  });

  // Group rules by server
  const grouped = rules.reduce<Record<string, SupervisorRuleDto[]>>((acc, rule) => {
    const key = rule.serverId ?? '__ops__';
    if (!acc[key]) acc[key] = [];
    acc[key].push(rule);
    return acc;
  }, {});

  const serverLabel = (serverId: string | null, serverName?: string | null): string => {
    if (!serverId) return 'Ops Server';
    return serverName ?? serverId;
  };

  const events = eventsData?.items ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Supervisor</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
        >
          Add Rule
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules list — 2/3 width */}
        <div className="lg:col-span-2 space-y-4">
          {/* Check all button */}
          <div className="flex justify-end">
            <button
              onClick={() => checkAll.mutate()}
              disabled={checkAll.isPending}
              className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {checkAll.isPending ? 'Checking...' : 'Check All'}
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading rules...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No supervisor rules configured yet</p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
              >
                Add your first rule
              </button>
            </div>
          ) : (
            Object.entries(grouped).map(([groupKey, groupRules]) => {
              const firstRule = groupRules[0];
              const label = serverLabel(firstRule.serverId, firstRule.serverName);
              return (
                <div key={groupKey}>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    {label}
                  </h3>
                  <div className="bg-surface border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">App</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Type</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Restarts</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Last Check</th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Auto-Restart</th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupRules.map((rule) => (
                          <tr
                            key={rule.id}
                            className={`border-b border-border/50 last:border-0 ${!rule.enabled ? 'opacity-50' : ''}`}
                          >
                            <td className="px-4 py-3 font-medium text-foreground">{rule.appName}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 text-xs rounded font-medium ${TYPE_COLORS[rule.appType] ?? 'bg-surface-2 text-muted-foreground'}`}>
                                {rule.appType}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 text-xs rounded font-medium ${STATUS_COLORS[rule.lastStatus ?? 'UNKNOWN']}`}>
                                {rule.lastStatus ?? 'UNKNOWN'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{rule.restartCount}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                              {rule.lastCheckAt ? timeAgo(rule.lastCheckAt) : 'Never'}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleRule.mutate(rule.id)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.enabled ? 'bg-primary' : 'bg-muted'}`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`}
                                />
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  onClick={() => checkOne.mutate(rule.id)}
                                  disabled={checkOne.isPending}
                                  className="px-2 py-0.5 text-xs rounded bg-info/10 text-info hover:bg-info/20 disabled:opacity-50"
                                >
                                  Check
                                </button>
                                <button
                                  onClick={() => setEditingRule(rule)}
                                  className="px-2 py-0.5 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`Delete rule for "${rule.appName}"?`)) {
                                      deleteRule.mutate(rule.id);
                                    }
                                  }}
                                  className="px-2 py-0.5 text-xs rounded bg-error/10 text-error hover:bg-error/20"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Events feed — 1/3 width */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Recent Events</h2>
            <button
              onClick={() => refetchEvents()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
          </div>
          <div className="bg-surface border border-border rounded-xl divide-y divide-border/50 max-h-[600px] overflow-y-auto">
            {events.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No events yet</div>
            ) : (
              events.map((event: any) => (
                <div key={event.id} className="px-4 py-3 flex gap-3 items-start">
                  <span
                    className={`mt-0.5 text-sm font-bold flex-shrink-0 ${SEVERITY_COLORS[event.severity] ?? 'text-muted-foreground'}`}
                  >
                    {SEVERITY_ICONS[event.severity] ?? '•'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(event.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Rule Modal */}
      {showModal && (
        <RuleModal
          servers={servers}
          onSubmit={(dto) => createRule.mutate(dto)}
          onClose={() => setShowModal(false)}
          isPending={createRule.isPending}
        />
      )}

      {/* Edit Rule Modal */}
      {editingRule && (
        <RuleModal
          servers={servers}
          rule={editingRule}
          onSubmit={(dto) => updateRule.mutate({ id: editingRule.id, ...dto })}
          onClose={() => setEditingRule(null)}
          isPending={updateRule.isPending}
        />
      )}
    </div>
  );
}

function RuleModal({
  servers,
  rule,
  onSubmit,
  onClose,
  isPending,
}: {
  servers: ManagedServerDto[];
  rule?: SupervisorRuleDto;
  onSubmit: (dto: CreateSupervisorRuleDto) => void;
  onClose: () => void;
  isPending?: boolean;
}) {
  const [serverId, setServerId] = useState(rule?.serverId ?? '');
  const [appName, setAppName] = useState(rule?.appName ?? '');
  const [appType, setAppType] = useState<'PM2' | 'DOCKER' | 'SYSTEMD'>(rule?.appType ?? 'PM2');
  const [autoRestart, setAutoRestart] = useState(rule?.autoRestart ?? true);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      serverId: serverId || undefined,
      appName,
      appType,
      autoRestart,
      enabled,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {rule ? 'Edit Rule' : 'Add Supervisor Rule'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Server</label>
            <select
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
            >
              <option value="">Ops Server</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">App Name</label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
              placeholder="my-api"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Type</label>
            <div className="flex gap-2">
              {(['PM2', 'DOCKER', 'SYSTEMD'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAppType(t)}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                    appType === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRestart}
                onChange={(e) => setAutoRestart(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">Auto-restart when DOWN</span>
            </label>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">Enabled</span>
            </label>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : rule ? 'Save Changes' : 'Add Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

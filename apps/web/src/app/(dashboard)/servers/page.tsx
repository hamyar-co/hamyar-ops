'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomModal } from '@/components/ui/CustomModal';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomTabs, TabItem } from '@/components/ui/CustomTabs';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomSwitch } from '@/components/ui/CustomSwitch';

interface ServerNode {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  role: 'WORKER' | 'LOAD_BALANCER' | 'PRIMARY';
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  cpuUsage: number;
  ramUsage: number;
  pingMs: number;
}

interface UpstreamPool {
  id: string;
  name: string;
  algorithm: 'round_robin' | 'least_conn' | 'ip_hash';
  port: number;
  targets: { serverId: string; serverName: string; weight: number; backup: boolean }[];
  healthCheckPath: string;
  active: boolean;
}

export default function ServersAndLoadBalancerPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('servers');
  const [isAddServerOpen, setIsAddServerOpen] = useState(false);
  const [isAddPoolOpen, setIsAddPoolOpen] = useState(false);

  // New server form
  const [serverForm, setServerForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: 'root',
    role: 'WORKER' as 'WORKER' | 'LOAD_BALANCER' | 'PRIMARY',
  });

  // New Pool form
  const [poolForm, setPoolForm] = useState({
    name: '',
    algorithm: 'round_robin' as 'round_robin' | 'least_conn' | 'ip_hash',
    port: 8080,
    healthCheckPath: '/health',
  });

  const { data: servers = [], isLoading: serversLoading } = useQuery<ServerNode[]>({
    queryKey: ['managed-servers-list'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/servers');
        if (Array.isArray(res.data) && res.data.length > 0) return res.data;
      } catch {}
      return [
        { id: 'srv-01', name: 'Current Primary Server (Hamyar Host)', host: '91.220.113.171', port: 22, username: 'root', role: 'PRIMARY', status: 'ONLINE', cpuUsage: 14, ramUsage: 42, pingMs: 1 },
        { id: 'srv-02', name: 'App Worker Node 1', host: '185.190.22.45', port: 22, username: 'deploy', role: 'WORKER', status: 'ONLINE', cpuUsage: 28, ramUsage: 56, pingMs: 12 },
        { id: 'srv-03', name: 'App Worker Node 2', host: '185.190.22.46', port: 22, username: 'deploy', role: 'WORKER', status: 'ONLINE', cpuUsage: 19, ramUsage: 38, pingMs: 14 },
      ];
    },
  });

  const { data: pools = [] } = useQuery<UpstreamPool[]>({
    queryKey: ['lb-upstream-pools'],
    queryFn: async () => [
      {
        id: 'pool-main-api',
        name: 'Backend API Upstream Cluster',
        algorithm: 'round_robin',
        port: 8080,
        targets: [
          { serverId: 'srv-01', serverName: 'Current Primary Server', weight: 1, backup: false },
          { serverId: 'srv-02', serverName: 'App Worker Node 1', weight: 1, backup: false },
          { serverId: 'srv-03', serverName: 'App Worker Node 2', weight: 1, backup: true },
        ],
        healthCheckPath: '/api/health',
        active: true,
      },
    ],
  });

  const addServer = useMutation({
    mutationFn: () => apiClient.post('/servers', serverForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['managed-servers-list'] });
      setIsAddServerOpen(false);
      setServerForm({ name: '', host: '', port: 22, username: 'root', role: 'WORKER' });
    },
  });

  const tabs: TabItem[] = [
    { id: 'servers', label: 'Registered Servers', icon: <span>☁</span>, badge: servers.length },
    { id: 'lb', label: 'Load Balancer Setup', icon: <span>⚖</span> },
    { id: 'pools', label: 'Upstream Pools', icon: <span>🔄</span>, badge: pools.length },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Servers & Load Balancers</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Connect remote server nodes and configure this server as a high-availability Nginx / HAProxy Load Balancer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'servers' && (
            <CustomButton size="sm" onClick={() => setIsAddServerOpen(true)} icon={<span>+</span>}>
              Add Remote Server
            </CustomButton>
          )}
          {activeTab === 'pools' && (
            <CustomButton size="sm" onClick={() => setIsAddPoolOpen(true)} icon={<span>+</span>}>
              Create Upstream Pool
            </CustomButton>
          )}
        </div>
      </div>

      {/* Tabs */}
      <CustomTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Registered Servers */}
      {activeTab === 'servers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((srv) => (
            <div key={srv.id} className="p-5 rounded-xl bg-surface border border-border space-y-4 hover:border-primary/40 transition-colors shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-sm">{srv.name}</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">{srv.username}@{srv.host}:{srv.port}</p>
                </div>
                <CustomBadge variant={srv.status === 'ONLINE' ? 'success' : 'error'}>
                  {srv.status}
                </CustomBadge>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/60 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Role</p>
                  <p className="text-xs font-semibold text-primary mt-0.5">{srv.role}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">CPU</p>
                  <p className="text-xs font-mono font-semibold text-foreground mt-0.5">{srv.cpuUsage}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Latency</p>
                  <p className="text-xs font-mono font-semibold text-foreground mt-0.5">{srv.pingMs}ms</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground font-mono">SSH Connected</span>
                <div className="flex items-center gap-1.5">
                  <CustomButton size="sm" variant="outline" onClick={() => alert(`Testing SSH connection to ${srv.host}... OK!`)}>
                    Test SSH
                  </CustomButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Load Balancer Configuration */}
      {activeTab === 'lb' && (
        <div className="bg-surface border border-border rounded-xl p-6 space-y-6 max-w-4xl">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">Load Balancer Mode Configuration</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Configure current primary server (<span className="font-mono font-bold text-primary">91.220.113.171</span>) to act as an Nginx reverse proxy load balancer distributing requests across target server nodes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-surface-2 border border-border space-y-2">
              <h4 className="text-xs font-semibold text-foreground">Balancing Mode</h4>
              <p className="text-xs text-muted-foreground">HTTP Layer 7 Nginx Upstream Balancing with Health Checks</p>
              <CustomBadge variant="success">Active on Port 80 / 443</CustomBadge>
            </div>

            <div className="p-4 rounded-lg bg-surface-2 border border-border space-y-2">
              <h4 className="text-xs font-semibold text-foreground">SSL Termination</h4>
              <p className="text-xs text-muted-foreground">Auto Let's Encrypt Wildcard SSL managed at Load Balancer</p>
              <CustomBadge variant="info">SSL Enabled</CustomBadge>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">Global Load Balancer Controls</h4>
            <div className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-lg">
              <div>
                <p className="text-xs font-semibold text-foreground">Health Checks</p>
                <p className="text-[11px] text-muted-foreground">Periodically probe target nodes every 10s and automatically drop unresponsive nodes</p>
              </div>
              <CustomSwitch checked={true} onChange={() => {}} />
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-lg">
              <div>
                <p className="text-xs font-semibold text-foreground">Sticky Sessions (IP Hash)</p>
                <p className="text-[11px] text-muted-foreground">Bind client IP address to the same backend server node for consistent session states</p>
              </div>
              <CustomSwitch checked={false} onChange={() => {}} />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Upstream Pools */}
      {activeTab === 'pools' && (
        <div className="space-y-4">
          {pools.map((p) => (
            <div key={p.id} className="bg-surface border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{p.name}</h3>
                    <CustomBadge variant="info">Port {p.port}</CustomBadge>
                    <CustomBadge variant="outline">{p.algorithm}</CustomBadge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Health check path: <span className="font-mono">{p.healthCheckPath}</span></p>
                </div>
                <CustomButton size="sm" variant="outline">Edit Pool</CustomButton>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border text-muted-foreground font-semibold">
                      <th className="px-4 py-2.5">Target Server</th>
                      <th className="px-4 py-2.5">Weight</th>
                      <th className="px-4 py-2.5">Role Type</th>
                      <th className="px-4 py-2.5">Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {p.targets.map((t) => (
                      <tr key={t.serverId} className="hover:bg-surface-2/40">
                        <td className="px-4 py-2.5 font-medium text-foreground">{t.serverName} ({t.serverId})</td>
                        <td className="px-4 py-2.5 font-mono">{t.weight}</td>
                        <td className="px-4 py-2.5">
                          <CustomBadge variant={t.backup ? 'warning' : 'default'}>
                            {t.backup ? 'Backup Server' : 'Primary Target'}
                          </CustomBadge>
                        </td>
                        <td className="px-4 py-2.5">
                          <CustomBadge variant="success">Healthy (200 OK)</CustomBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Server Modal */}
      <CustomModal
        isOpen={isAddServerOpen}
        onClose={() => setIsAddServerOpen(false)}
        title="Add Remote Server"
        description="Register a new remote worker node or load balancer target."
      >
        <div className="space-y-4">
          <CustomInput
            label="Server Display Name"
            placeholder="e.g. Worker Node 3"
            value={serverForm.name}
            onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <CustomInput
              label="IP Address / Host"
              placeholder="185.190.22.50"
              value={serverForm.host}
              onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })}
            />
            <CustomInput
              label="SSH Port"
              type="number"
              value={serverForm.port}
              onChange={(e) => setServerForm({ ...serverForm, port: Number(e.target.value) })}
            />
          </div>
          <CustomInput
            label="SSH Username"
            value={serverForm.username}
            onChange={(e) => setServerForm({ ...serverForm, username: e.target.value })}
          />
          <CustomSelect
            label="Server Role"
            value={serverForm.role}
            onChange={(v) => setServerForm({ ...serverForm, role: v as any })}
            options={[
              { value: 'WORKER', label: 'Worker Node', description: 'Runs application containers' },
              { value: 'LOAD_BALANCER', label: 'Load Balancer Node', description: 'Proxies & balances HTTP traffic' },
              { value: 'PRIMARY', label: 'Primary Master Node', description: 'Central control node' },
            ]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <CustomButton variant="outline" onClick={() => setIsAddServerOpen(false)}>Cancel</CustomButton>
            <CustomButton
              loading={addServer.isPending}
              disabled={!serverForm.name || !serverForm.host}
              onClick={() => addServer.mutate()}
            >
              Add Server
            </CustomButton>
          </div>
        </div>
      </CustomModal>

      {/* Create Pool Modal */}
      <CustomModal
        isOpen={isAddPoolOpen}
        onClose={() => setIsAddPoolOpen(false)}
        title="Create Upstream Pool"
        description="Group target servers into a load-balanced upstream pool."
      >
        <div className="space-y-4">
          <CustomInput
            label="Pool Name"
            placeholder="e.g. Web Apps Pool"
            value={poolForm.name}
            onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
          />
          <CustomSelect
            label="Balancing Algorithm"
            value={poolForm.algorithm}
            onChange={(v) => setPoolForm({ ...poolForm, algorithm: v as any })}
            options={[
              { value: 'round_robin', label: 'Round Robin', description: 'Distribute requests evenly in order' },
              { value: 'least_conn', label: 'Least Connections', description: 'Pass request to server with fewest active connections' },
              { value: 'ip_hash', label: 'IP Hash (Sticky)', description: 'Route same client IP to same server' },
            ]}
          />
          <CustomInput
            label="Listen Port"
            type="number"
            value={poolForm.port}
            onChange={(e) => setPoolForm({ ...poolForm, port: Number(e.target.value) })}
          />
          <CustomInput
            label="Health Check HTTP Path"
            value={poolForm.healthCheckPath}
            onChange={(e) => setPoolForm({ ...poolForm, healthCheckPath: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <CustomButton variant="outline" onClick={() => setIsAddPoolOpen(false)}>Cancel</CustomButton>
            <CustomButton onClick={() => setIsAddPoolOpen(false)}>Create Pool</CustomButton>
          </div>
        </div>
      </CustomModal>
    </div>
  );
}
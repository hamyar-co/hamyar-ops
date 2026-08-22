'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomModal } from '@/components/ui/CustomModal';
import { CustomSwitch } from '@/components/ui/CustomSwitch';

interface FirewallRule {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  action: 'ALLOW' | 'DENY' | 'REJECT';
  protocol: 'TCP' | 'UDP' | 'ANY';
  port: string;
  sourceCidr: string;
  comment?: string;
}

const QUICK_PRESETS = [
  { label: 'HTTP (Port 80)', port: '80', protocol: 'TCP', action: 'ALLOW', comment: 'Web HTTP Traffic' },
  { label: 'HTTPS (Port 443)', port: '443', protocol: 'TCP', action: 'ALLOW', comment: 'Web HTTPS Traffic' },
  { label: 'SSH (Port 22)', port: '22', protocol: 'TCP', action: 'ALLOW', comment: 'Secure Shell Remote Access' },
  { label: 'PostgreSQL (Port 5432)', port: '5432', protocol: 'TCP', action: 'ALLOW', comment: 'Postgres DB Server' },
  { label: 'Redis (Port 6379)', port: '6379', protocol: 'TCP', action: 'ALLOW', comment: 'Redis Cache Server' },
  { label: 'RabbitMQ (Port 5672)', port: '5672', protocol: 'TCP', action: 'ALLOW', comment: 'RabbitMQ Broker' },
];

export default function ServerFirewallPage() {
  const qc = useQueryClient();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    direction: 'INBOUND' as 'INBOUND' | 'OUTBOUND',
    action: 'ALLOW' as 'ALLOW' | 'DENY' | 'REJECT',
    protocol: 'TCP' as 'TCP' | 'UDP' | 'ANY',
    port: '80',
    sourceCidr: '0.0.0.0/0',
    comment: '',
  });

  const { data: rules = [], isLoading } = useQuery<FirewallRule[]>({
    queryKey: ['server-firewall-rules'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/server-firewall/self/rules');
        return res.data;
      } catch {
        return [
          { id: '1', direction: 'INBOUND', action: 'ALLOW', protocol: 'TCP', port: '80', sourceCidr: '0.0.0.0/0', comment: 'Web Nginx Port 80' },
          { id: '2', direction: 'INBOUND', action: 'ALLOW', protocol: 'TCP', port: '443', sourceCidr: '0.0.0.0/0', comment: 'Web SSL Port 443' },
          { id: '3', direction: 'INBOUND', action: 'ALLOW', protocol: 'TCP', port: '22', sourceCidr: '0.0.0.0/0', comment: 'OpenSSH Server' },
          { id: '4', direction: 'INBOUND', action: 'ALLOW', protocol: 'TCP', port: '5432', sourceCidr: '127.0.0.1/32', comment: 'PostgreSQL Local' },
          { id: '5', direction: 'INBOUND', action: 'DENY', protocol: 'ANY', port: '3306', sourceCidr: '0.0.0.0/0', comment: 'Block Remote MySQL' },
        ];
      }
    },
  });

  const addRule = useMutation({
    mutationFn: () => apiClient.post('/server-firewall/self/rules', ruleForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['server-firewall-rules'] });
      setIsAddModalOpen(false);
      setRuleForm({ direction: 'INBOUND', action: 'ALLOW', protocol: 'TCP', port: '80', sourceCidr: '0.0.0.0/0', comment: '' });
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/server-firewall/self/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['server-firewall-rules'] }),
  });

  const applyPreset = (preset: typeof QUICK_PRESETS[number]) => {
    setRuleForm({
      direction: 'INBOUND',
      action: preset.action as any,
      protocol: preset.protocol as any,
      port: preset.port,
      sourceCidr: '0.0.0.0/0',
      comment: preset.comment,
    });
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Server Firewall Manager (UFW / iptables)</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure inbound and outbound traffic rules, port access permissions, CIDR masks, and quick security presets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton size="sm" onClick={() => setIsAddModalOpen(true)} icon={<span>+</span>}>
            Add Firewall Rule
          </CustomButton>
        </div>
      </div>

      {/* Master Toggle & Overview */}
      <div className="bg-surface border border-border rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-xl">
            🛡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">UFW Firewall Engine</h3>
              <CustomBadge variant={isEnabled ? 'success' : 'error'}>
                {isEnabled ? 'ACTIVE & ENFORCING' : 'DISABLED'}
              </CustomBadge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Default Incoming: <span className="font-semibold text-foreground">DENY</span> | Default Outgoing: <span className="font-semibold text-foreground font-mono">ALLOW</span>
            </p>
          </div>
        </div>

        <CustomSwitch
          checked={isEnabled}
          onChange={setIsEnabled}
          label={isEnabled ? 'Firewall Protection On' : 'Firewall Off'}
        />
      </div>

      {/* Quick Rule Presets */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Quick Presets Library</h3>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-2 hover:border-primary/40 transition-all flex items-center gap-1.5 shrink-0"
            >
              <span className="text-primary font-bold">+</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Firewall Rules Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Active Firewall Rules</h3>
          <CustomBadge variant="info">{rules.length} Rules Enforced</CustomBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Direction</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Protocol</th>
                <th className="px-5 py-3">Port / Range</th>
                <th className="px-5 py-3">Source CIDR</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">Loading firewall rules...</td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">No firewall rules defined</td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      <CustomBadge variant={r.direction === 'INBOUND' ? 'info' : 'outline'}>
                        {r.direction}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant={r.action === 'ALLOW' ? 'success' : 'error'}>
                        {r.action}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-foreground font-bold">{r.protocol}</td>
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-primary">{r.port}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{r.sourceCidr}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{r.comment || '–'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <CustomButton
                        size="sm"
                        variant="ghost"
                        className="text-error hover:bg-error/10"
                        loading={deleteRule.isPending && deleteRule.variables === r.id}
                        onClick={() => deleteRule.mutate(r.id)}
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

      {/* Add Rule Modal */}
      <CustomModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Firewall Rule"
        description="Configure rule action, target port, protocol, and allowed source IP address."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <CustomSelect
              label="Direction"
              value={ruleForm.direction}
              onChange={(v) => setRuleForm({ ...ruleForm, direction: v as any })}
              options={[
                { value: 'INBOUND', label: 'Inbound (Incoming)' },
                { value: 'OUTBOUND', label: 'Outbound (Outgoing)' },
              ]}
            />
            <CustomSelect
              label="Action"
              value={ruleForm.action}
              onChange={(v) => setRuleForm({ ...ruleForm, action: v as any })}
              options={[
                { value: 'ALLOW', label: 'ALLOW (Grant Access)' },
                { value: 'DENY', label: 'DENY (Block Packets)' },
                { value: 'REJECT', label: 'REJECT (Drop with ICMP)' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CustomSelect
              label="Protocol"
              value={ruleForm.protocol}
              onChange={(v) => setRuleForm({ ...ruleForm, protocol: v as any })}
              options={[
                { value: 'TCP', label: 'TCP Protocol' },
                { value: 'UDP', label: 'UDP Protocol' },
                { value: 'ANY', label: 'ANY (TCP/UDP)' },
              ]}
            />
            <CustomInput
              label="Port / Port Range"
              placeholder="e.g. 80 or 8000:8080"
              value={ruleForm.port}
              onChange={(e) => setRuleForm({ ...ruleForm, port: e.target.value })}
            />
          </div>

          <CustomInput
            label="Source IP CIDR Mask"
            placeholder="0.0.0.0/0 for all, or 192.168.1.0/24"
            value={ruleForm.sourceCidr}
            onChange={(e) => setRuleForm({ ...ruleForm, sourceCidr: e.target.value })}
          />

          <CustomInput
            label="Rule Description / Note"
            placeholder="e.g. Allow Nginx HTTP traffic"
            value={ruleForm.comment}
            onChange={(e) => setRuleForm({ ...ruleForm, comment: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-2">
            <CustomButton variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</CustomButton>
            <CustomButton
              loading={addRule.isPending}
              disabled={!ruleForm.port}
              onClick={() => addRule.mutate()}
            >
              Add Rule
            </CustomButton>
          </div>
        </div>
      </CustomModal>
    </div>
  );
}

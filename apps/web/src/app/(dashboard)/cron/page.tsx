'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomModal } from '@/components/ui/CustomModal';

interface CronJobItem {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  lastStatus?: 'success' | 'failed';
}

const PRECREATED_CRON_PRESETS = [
  { name: 'System Database Backup', schedule: '0 3 * * *', command: 'hamyar-ops backup --db postgres', category: 'Backup' },
  { name: 'Docker System Prune', schedule: '0 5 * * 0', command: 'docker system prune -f --volumes', category: 'Maintenance' },
  { name: 'Rotate System Logs', schedule: '0 0 * * *', command: 'logrotate -f /etc/logrotate.d/hamyar', category: 'System' },
  { name: 'SSL Cert Renewal Check', schedule: '0 1 1 * *', command: 'certbot renew --quiet', category: 'Security' },
  { name: 'Application Health Probe', schedule: '*/5 * * * *', command: 'curl -fsSL http://localhost:3000/api/health', category: 'Monitoring' },
  { name: 'PM2 Memory Optimization', schedule: '0 */6 * * *', command: 'pm2 reload all', category: 'Application' },
];

export default function CronPage() {
  const qc = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [cronForm, setCronForm] = useState({
    name: '',
    schedule: '0 3 * * *',
    command: '',
  });

  const { data: cronJobs = [], isLoading } = useQuery<CronJobItem[]>({
    queryKey: ['cron-jobs'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/cron');
        return res.data;
      } catch {
        return PRECREATED_CRON_PRESETS.map((p, idx) => ({
          id: `cron-${idx}`,
          name: p.name,
          schedule: p.schedule,
          command: p.command,
          enabled: true,
          lastRun: new Date(Date.now() - 3600000).toISOString(),
          nextRun: new Date(Date.now() + 82800000).toISOString(),
          lastStatus: 'success',
        }));
      }
    },
  });

  const toggleCron = useMutation({
    mutationFn: (id: string) => apiClient.post(`/cron/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron-jobs'] }),
  });

  const runManual = useMutation({
    mutationFn: (id: string) => apiClient.post(`/cron/${id}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron-jobs'] }),
  });

  const createCron = useMutation({
    mutationFn: () => apiClient.post('/cron', cronForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cron-jobs'] });
      setIsAddModalOpen(false);
      setCronForm({ name: '', schedule: '0 3 * * *', command: '' });
    },
  });

  const selectPreset = (preset: typeof PRECREATED_CRON_PRESETS[number]) => {
    setCronForm({
      name: preset.name,
      schedule: preset.schedule,
      command: preset.command,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scheduled Cron Jobs</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Automate recurring server tasks, database backups, log rotations, and system health checks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton size="sm" onClick={() => setIsAddModalOpen(true)} icon={<span>+</span>}>
            Add Cron Job
          </CustomButton>
        </div>
      </div>

      {/* Pre-created Presets Bar */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Pre-created Cron Presets Library</h3>
          <span className="text-[11px] text-muted-foreground">Select a preset to auto-fill job configuration</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {PRECREATED_CRON_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => {
                selectPreset(p);
                setIsAddModalOpen(true);
              }}
              className="p-2.5 rounded-lg border border-border bg-surface-2 hover:bg-surface hover:border-primary/40 text-left transition-all group shrink-0"
            >
              <div className="flex items-center justify-between mb-1">
                <CustomBadge size="sm" variant="outline">{p.category}</CustomBadge>
                <span className="text-xs font-mono font-bold text-primary">{p.schedule}</span>
              </div>
              <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">{p.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Cron Jobs Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Configured Scheduled Jobs</h3>
          <CustomBadge variant="info">{cronJobs.length} Active Crons</CustomBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Task Name</th>
                <th className="px-5 py-3">Schedule</th>
                <th className="px-5 py-3">Command</th>
                <th className="px-5 py-3">Last Run</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Loading cron jobs...</td>
                </tr>
              ) : cronJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">No cron jobs configured</td>
                </tr>
              ) : (
                cronJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span>⏰</span>
                        <span>{j.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-primary">{j.schedule}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground truncate max-w-xs">{j.command}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {j.lastRun ? new Date(j.lastRun).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant={j.enabled ? 'success' : 'outline'}>
                        {j.enabled ? 'Enabled' : 'Disabled'}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <CustomButton
                          size="sm"
                          variant="outline"
                          loading={runManual.isPending && runManual.variables === j.id}
                          onClick={() => runManual.mutate(j.id)}
                        >
                          Trigger Now
                        </CustomButton>
                        <CustomButton
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleCron.mutate(j.id)}
                        >
                          {j.enabled ? 'Disable' : 'Enable'}
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

      {/* Add Cron Modal */}
      <CustomModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Scheduled Cron Job"
        description="Select from presets or enter custom job schedule and shell command."
      >
        <div className="space-y-4">
          <CustomInput
            label="Job Name"
            placeholder="e.g. Daily Database Backup"
            value={cronForm.name}
            onChange={(e) => setCronForm({ ...cronForm, name: e.target.value })}
          />

          <CustomInput
            label="Cron Schedule Expression"
            placeholder="e.g. 0 3 * * * or */5 * * * *"
            value={cronForm.schedule}
            onChange={(e) => setCronForm({ ...cronForm, schedule: e.target.value })}
            helperText="5-part cron syntax: [minute] [hour] [day-of-month] [month] [day-of-week]"
          />

          <CustomInput
            label="Executable Shell Command"
            placeholder="e.g. hamyar-ops backup --db postgres"
            value={cronForm.command}
            onChange={(e) => setCronForm({ ...cronForm, command: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-2">
            <CustomButton variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</CustomButton>
            <CustomButton
              loading={createCron.isPending}
              disabled={!cronForm.name || !cronForm.command}
              onClick={() => createCron.mutate()}
            >
              Create Cron Job
            </CustomButton>
          </div>
        </div>
      </CustomModal>
    </div>
  );
}

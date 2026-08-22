'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { BackupStrategyDto, CreateBackupStrategyDto, UpdateBackupStrategyDto, S3ConfigDto, BackupTargetType, AppConfigDto } from '@hamyar-ops/shared';

interface Props {
  initialData?: BackupStrategyDto;
  onClose: () => void;
}

export function StrategyModal({ initialData, onClose }: Props) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState<CreateBackupStrategyDto>({
    name: '',
    targetType: 'app',
    targets: [],
    storage: 'local',
    scheduleCron: '0 2 * * *', // Daily at 2 AM
    retentionMax: 7,
    excludeNodeModules: true,
    enabled: true,
  });

  const { data: s3Configs = [] } = useQuery({
    queryKey: ['backups-s3'],
    queryFn: () => apiClient.get('/backups/s3').then(r => r.data as S3ConfigDto[]),
  });

  const { data: apps = [] } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get('/applications').then(r => r.data as AppConfigDto[]),
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        targetType: initialData.targetType,
        targets: initialData.targets,
        storage: initialData.storage,
        s3ConfigId: initialData.s3ConfigId || undefined,
        scheduleCron: initialData.scheduleCron,
        retentionMax: initialData.retentionMax,
        excludeNodeModules: initialData.excludeNodeModules,
        enabled: initialData.enabled,
      });
    }
  }, [initialData]);

  const save = useMutation({
    mutationFn: (data: CreateBackupStrategyDto | UpdateBackupStrategyDto) =>
      initialData
        ? apiClient.put(`/backups/strategies/${initialData.id}`, data)
        : apiClient.post('/backups/strategies', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups-strategies'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...formData };
    if (data.storage === 'local') {
      delete data.s3ConfigId;
    }
    save.mutate(data);
  };

  const handleTargetToggle = (target: string) => {
    setFormData(prev => ({
      ...prev,
      targets: prev.targets.includes(target) 
        ? prev.targets.filter(t => t !== target)
        : [...prev.targets, target]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            {initialData ? 'Edit Backup Strategy' : 'New Backup Strategy'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Strategy Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              placeholder="e.g. Daily App Backups"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Target Type</label>
              <select
                value={formData.targetType}
                onChange={(e) => setFormData({ ...formData, targetType: e.target.value as BackupTargetType, targets: [] })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                <option value="app">Applications</option>
                <option value="full">Full System Backup</option>
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Cron Schedule</label>
              <input
                type="text"
                required
                value={formData.scheduleCron}
                onChange={(e) => setFormData({ ...formData, scheduleCron: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                placeholder="0 2 * * *"
              />
            </div>
          </div>

          {formData.targetType === 'app' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Select Targets</label>
              <div className="bg-surface-2 border border-border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                {apps.map(app => (
                  <label key={app.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.targets.includes(app.pm2Name)}
                      onChange={() => handleTargetToggle(app.pm2Name)}
                      className="rounded border-border text-primary focus:ring-primary bg-surface"
                    />
                    <span className="text-sm text-foreground">{app.name} <span className="text-muted-foreground text-xs font-mono ml-1">({app.pm2Name})</span></span>
                  </label>
                ))}
                {apps.length === 0 && <div className="text-xs text-muted-foreground p-2">No applications found.</div>}
              </div>
            </div>
          )}

          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-sm font-medium text-foreground">Storage & Retention</h3>
            
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="strategy-storage"
                  checked={formData.storage === 'local'}
                  onChange={() => setFormData({ ...formData, storage: 'local', s3ConfigId: undefined })}
                  className="w-4 h-4 text-primary focus:ring-primary bg-surface-2 border-border"
                />
                <span className="text-sm text-foreground">Local Server</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="strategy-storage"
                  checked={formData.storage === 's3'}
                  onChange={() => setFormData({ ...formData, storage: 's3', s3ConfigId: s3Configs[0]?.id })}
                  className="w-4 h-4 text-primary focus:ring-primary bg-surface-2 border-border"
                />
                <span className="text-sm text-foreground">S3 Object Storage</span>
              </label>
            </div>

            {formData.storage === 's3' && (
              <div className="pt-2">
                <select
                  required
                  value={formData.s3ConfigId || ''}
                  onChange={(e) => setFormData({ ...formData, s3ConfigId: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="" disabled>Select S3 Configuration</option>
                  {s3Configs.map((s3) => (
                    <option key={s3.id} value={s3.id}>{s3.name} ({s3.bucket})</option>
                  ))}
                </select>
                {s3Configs.length === 0 && (
                  <p className="text-xs text-warning mt-1">No S3 configurations found. Add one in the S3 tab first.</p>
                )}
              </div>
            )}
            
            <div className="pt-2">
               <label className="text-sm font-medium text-foreground block mb-1">Max Retained Backups (per target)</label>
               <input
                 type="number"
                 min="1"
                 max="100"
                 required
                 value={formData.retentionMax}
                 onChange={(e) => setFormData({ ...formData, retentionMax: parseInt(e.target.value) || 1 })}
                 className="w-full max-w-[200px] bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
               />
            </div>
          </div>

          <div className="flex items-end pt-2 border-t border-border">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary bg-surface-2"
              />
              <span className="text-sm font-medium text-foreground">Enable Strategy</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending || (formData.storage === 's3' && !formData.s3ConfigId)}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {save.isPending ? 'Saving…' : 'Save Strategy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

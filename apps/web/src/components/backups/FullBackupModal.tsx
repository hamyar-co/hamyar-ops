'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { CreateFullBackupDto, S3ConfigDto } from '@hamyar-ops/shared';

interface Props {
  onClose: () => void;
}

export function FullBackupModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState<CreateFullBackupDto>({
    name: 'manual-full',
    includeApps: true,
    includeDatabases: true,
    includeSshKeys: true,
    includeEnvVars: true,
    includeDockerConfigs: true,
    storage: 'local',
  });

  const { data: s3Configs = [] } = useQuery({
    queryKey: ['backups-s3'],
    queryFn: () => apiClient.get('/backups/s3').then(r => r.data as S3ConfigDto[]),
  });

  const runBackup = useMutation({
    mutationFn: (data: CreateFullBackupDto) => apiClient.post('/backups/full', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups-full'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...formData };
    if (data.storage === 'local') delete data.s3ConfigId;
    runBackup.mutate(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Trigger Full System Backup</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Backup Name Prefix (Optional)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              placeholder="e.g. before-upgrade"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <h3 className="text-sm font-medium text-foreground mb-3">Include in backup:</h3>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.includeApps}
                onChange={(e) => setFormData({ ...formData, includeApps: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary bg-surface-2"
              />
              <span className="text-sm text-foreground">Applications (Source code, node_modules excluded)</span>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.includeDatabases}
                onChange={(e) => setFormData({ ...formData, includeDatabases: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary bg-surface-2"
              />
              <span className="text-sm text-foreground">Databases (PostgreSQL, MySQL dumps)</span>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.includeSshKeys}
                onChange={(e) => setFormData({ ...formData, includeSshKeys: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary bg-surface-2"
              />
              <span className="text-sm text-foreground">SSH Keys (/root/.ssh, /home/*/.ssh)</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.includeEnvVars}
                onChange={(e) => setFormData({ ...formData, includeEnvVars: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary bg-surface-2"
              />
              <span className="text-sm text-foreground">Environment Variables (Server-level .env)</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.includeDockerConfigs}
                onChange={(e) => setFormData({ ...formData, includeDockerConfigs: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary bg-surface-2"
              />
              <span className="text-sm text-foreground">Docker Configurations (Compose, daemon.json)</span>
            </label>
          </div>

          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-sm font-medium text-foreground">Storage Destination</h3>
            
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="storage"
                  checked={formData.storage === 'local'}
                  onChange={() => setFormData({ ...formData, storage: 'local', s3ConfigId: undefined })}
                  className="w-4 h-4 text-primary focus:ring-primary bg-surface-2 border-border"
                />
                <span className="text-sm text-foreground">Local Server</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="storage"
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
          </div>

          <div className="flex justify-end gap-3 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={runBackup.isPending || (formData.storage === 's3' && !formData.s3ConfigId)}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {runBackup.isPending ? 'Starting…' : 'Start Backup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

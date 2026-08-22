'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { MicroserviceDto, CreateMicroserviceDto, UpdateMicroserviceDto } from '@hamyar-ops/shared';

interface Props {
  projectId: string;
  initialData?: MicroserviceDto;
  onClose: () => void;
}

export function ServiceModal({ projectId, initialData, onClose }: Props) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState<CreateMicroserviceDto>({
    projectId,
    name: '',
    pm2Prefix: '',
    deployPath: '',
    startCmd: 'yarn start:prod',
    basePort: 3000,
    targetInstances: 1,
    routePrefix: '/',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        projectId: initialData.projectId,
        name: initialData.name,
        pm2Prefix: initialData.pm2Prefix,
        deployPath: initialData.deployPath || '',
        startCmd: initialData.startCmd || '',
        basePort: initialData.basePort,
        targetInstances: initialData.targetInstances,
        routePrefix: initialData.routePrefix || '',
      });
    }
  }, [initialData]);

  const save = useMutation({
    mutationFn: (data: CreateMicroserviceDto | UpdateMicroserviceDto) =>
      initialData
        ? apiClient.put(`/microservices/services/${initialData.id}`, data)
        : apiClient.post('/microservices/services', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['microservices-projects'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            {initialData ? 'Edit Microservice' : 'Add Microservice'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Service Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="e.g. Admin API"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">PM2 Prefix</label>
              <input
                type="text"
                required
                disabled={!!initialData}
                value={formData.pm2Prefix}
                onChange={(e) => setFormData({ ...formData, pm2Prefix: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                placeholder="e.g. admin-api"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-foreground">Deploy Path (Absolute)</label>
              <input
                type="text"
                value={formData.deployPath || ''}
                onChange={(e) => setFormData({ ...formData, deployPath: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                placeholder="/var/www/hamyar-backend/admin-api"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-foreground">Start Command</label>
              <input
                type="text"
                value={formData.startCmd || ''}
                onChange={(e) => setFormData({ ...formData, startCmd: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                placeholder="yarn start:prod"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Base Port</label>
              <input
                type="number"
                required
                value={formData.basePort}
                onChange={(e) => setFormData({ ...formData, basePort: parseInt(e.target.value) || 3000 })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">First port (e.g. 3001, 3002...)</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Nginx Route Prefix</label>
              <input
                type="text"
                value={formData.routePrefix || ''}
                onChange={(e) => setFormData({ ...formData, routePrefix: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                placeholder="e.g. /admin-api/ or /"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Target Instances</label>
              <input
                type="number"
                min="1"
                max="20"
                required
                value={formData.targetInstances}
                onChange={(e) => setFormData({ ...formData, targetInstances: parseInt(e.target.value) || 1 })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {save.isPending ? 'Saving…' : 'Save Microservice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

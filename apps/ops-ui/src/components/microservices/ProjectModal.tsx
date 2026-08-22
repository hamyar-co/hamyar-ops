'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { CreateMicroserviceProjectDto } from '@hamyar-ops/shared';

interface Props {
  onClose: () => void;
}

export function ProjectModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState<CreateMicroserviceProjectDto>({
    name: '',
    domain: '',
    description: '',
  });

  const save = useMutation({
    mutationFn: (data: CreateMicroserviceProjectDto) => apiClient.post('/microservices/projects', data),
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
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg mx-4 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">New Microservices Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Project Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              placeholder="e.g. Hamyar Backend"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Main Domain</label>
            <input
              type="text"
              value={formData.domain || ''}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              placeholder="e.g. api.hamyar.app"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary min-h-[100px]"
              placeholder="Optional description"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
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
              {save.isPending ? 'Saving…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

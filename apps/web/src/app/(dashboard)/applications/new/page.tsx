'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export default function NewApplicationPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    pm2Name: '',
    domain: '',
    healthUrl: '',
    envPath: '',
    deployPath: '',
    deployCmd: '',
    repoUrl: '',
    branch: 'main',
    containerName: '',
    dbType: '',
    dbName: '',
    serverId: '',
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data as { id: string; name: string }[]),
  });

  const create = useMutation({
    mutationFn: () => {
      const { serverId, ...rest } = form;
      return apiClient.post('/applications', { ...rest, ...(serverId ? { serverId } : {}) });
    },
    onSuccess: () => router.push('/applications'),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground mb-4 block"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-foreground">Add Application</h1>
        <p className="text-sm text-muted-foreground mt-1">Register a new application for management</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
        className="bg-surface border border-border rounded-xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Hamyar Backend"
              required
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">PM2 Name *</label>
            <input
              name="pm2Name"
              value={form.pm2Name}
              onChange={handleChange}
              placeholder="hamyar-backend"
              required
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Domain</label>
            <input
              name="domain"
              value={form.domain}
              onChange={handleChange}
              placeholder="api.hamyar.app"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Health Check URL</label>
            <input
              name="healthUrl"
              value={form.healthUrl}
              onChange={handleChange}
              placeholder="https://api.hamyar.app/v1/health/live"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Env Path</label>
            <input
              name="envPath"
              value={form.envPath}
              onChange={handleChange}
              placeholder="/opt/hamyar/backend/.env"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Deploy Path</label>
            <input
              name="deployPath"
              value={form.deployPath}
              onChange={handleChange}
              placeholder="/opt/hamyar/backend"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Container Name</label>
            <input
              name="containerName"
              value={form.containerName}
              onChange={handleChange}
              placeholder="(for dockerized apps) postgres"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">DB Type</label>
            <input
              name="dbType"
              value={form.dbType}
              onChange={handleChange}
              placeholder="postgres | mysql (optional)"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">DB Name</label>
            <input
              name="dbName"
              value={form.dbName}
              onChange={handleChange}
              placeholder="hamyar"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Deploy Command</label>
            <input
              name="deployCmd"
              value={form.deployCmd}
              onChange={handleChange}
              placeholder="cd /opt/hamyar/backend && git pull && pnpm build && pm2 restart hamyar-backend"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Repository URL</label>
            <input
              name="repoUrl"
              value={form.repoUrl}
              onChange={handleChange}
              placeholder="https://github.com/..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Branch</label>
            <input
              name="branch"
              value={form.branch}
              onChange={handleChange}
              placeholder="main"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-foreground">Target Server</label>
            <select
              name="serverId"
              value={form.serverId}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground"
            >
              <option value="">Ops Server (default)</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Select which server this application is deployed on.</p>
          </div>
        </div>

        {create.isError && (
          <p className="text-sm text-error">{(create.error as any)?.response?.data?.message ?? 'Failed to create application'}</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {create.isPending ? 'Creating…' : 'Create Application'}
          </button>
        </div>
      </form>
    </div>
  );
}

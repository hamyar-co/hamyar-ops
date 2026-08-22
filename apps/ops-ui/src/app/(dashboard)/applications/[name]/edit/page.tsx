'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { AppConfigDto } from '@hamyar-ops/shared';

export default function EditApplicationPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = use(params);
  const name = decodeURIComponent(rawName);
  const router = useRouter();

  const { data: apps } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get('/applications').then((r) => r.data as AppConfigDto[]),
  });
  const app = apps?.find((a) => a.pm2Name === name);

  const [form, setForm] = useState<Partial<AppConfigDto>>({});
  const merged = { ...(app ?? {}), ...form } as any;

  const update = useMutation({
    mutationFn: () => {
      const dto = {
        name: merged.name, envPath: merged.envPath, deployPath: merged.deployPath,
        deployCmd: merged.deployCmd, repoUrl: merged.repoUrl, branch: merged.branch,
        healthUrl: merged.healthUrl, domain: merged.domain,
        containerName: merged.containerName ?? null, dbType: merged.dbType ?? null, dbName: merged.dbName ?? null,
      };
      return apiClient.put(`/applications/${app!.id}`, dto);
    },
    onSuccess: () => router.push(`/applications/${name}`),
  });

  if (!apps) return <div className="text-muted-foreground">Loading…</div>;
  if (!app) return <div className="text-muted-foreground">Application not found.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground mb-4 block">← Back</button>
        <h1 className="text-2xl font-semibold text-foreground">Edit Application</h1>
        <p className="text-sm text-muted-foreground mt-1">{app.name} · <span className="font-mono">{app.pm2Name}</span></p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); update.mutate(); }} className="bg-surface border border-border rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Name *" value={merged.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="PM2 Name" value={merged.pm2Name} disabled />
          <Field label="Domain" value={merged.domain} onChange={(v) => setForm({ ...form, domain: v })} placeholder="api.hamyar.app" />
          <Field label="Health URL" value={merged.healthUrl} onChange={(v) => setForm({ ...form, healthUrl: v })} placeholder="https://api.hamyar.app/v1/health/live" />
          <Field label="Deploy path" value={merged.deployPath} onChange={(v) => setForm({ ...form, deployPath: v })} placeholder="/opt/hamyar/backend" />
          <Field label="Env path" value={merged.envPath} onChange={(v) => setForm({ ...form, envPath: v })} placeholder="/opt/hamyar/backend/.env" />
          <Field label="Container name" value={merged.containerName} onChange={(v) => setForm({ ...form, containerName: v })} placeholder="postgres" />
          <Field label="DB type" value={merged.dbType} onChange={(v) => setForm({ ...form, dbType: v })} placeholder="postgres | mysql" />
          <Field label="DB name" value={merged.dbName} onChange={(v) => setForm({ ...form, dbName: v })} placeholder="hamyar" />
          <Field label="Deploy command" value={merged.deployCmd} onChange={(v) => setForm({ ...form, deployCmd: v })} placeholder="cd … && git pull && pnpm build && pm2 restart …" />
          <Field label="Repository URL" value={merged.repoUrl} onChange={(v) => setForm({ ...form, repoUrl: v })} placeholder="https://github.com/…" />
          <Field label="Branch" value={merged.branch} onChange={(v) => setForm({ ...form, branch: v })} placeholder="main" />
        </div>

        {update.isError && <p className="text-sm text-error">{(update.error as any)?.response?.data?.message ?? 'Failed to update'}</p>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="submit" disabled={update.isPending} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled }: {
  label: string; value?: string | null; onChange?: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        value={value ?? ''}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-60"
      />
    </div>
  );
}
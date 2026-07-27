'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { S3ConfigDto, CreateS3ConfigDto, UpdateS3ConfigDto } from '@hamyar-ops/shared';

interface Props {
  initialData?: S3ConfigDto;
  onClose: () => void;
}

export function S3ConfigModal({ initialData, onClose }: Props) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState<CreateS3ConfigDto>({
    name: '',
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    usePathStyle: true,
  });
  const [testResult, setTestResult] = useState<{ ok?: boolean; msg?: string } | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        endpoint: initialData.endpoint,
        region: initialData.region,
        bucket: initialData.bucket,
        accessKeyId: initialData.accessKeyId,
        secretAccessKey: '', // keep empty to not override unless typed
        usePathStyle: initialData.usePathStyle,
      });
    }
  }, [initialData]);

  const save = useMutation({
    mutationFn: (data: CreateS3ConfigDto | UpdateS3ConfigDto) =>
      initialData
        ? apiClient.put(`/backups/s3/${initialData.id}`, data)
        : apiClient.post('/backups/s3', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups-s3'] });
      onClose();
    },
  });

  const testConnection = useMutation({
    mutationFn: () => apiClient.post(`/backups/s3/${initialData?.id}/test`),
    onSuccess: (res) => {
      setTestResult({ ok: true, msg: 'Connection successful!' });
    },
    onError: (err: any) => {
      setTestResult({ ok: false, msg: err.response?.data?.message || 'Connection failed' });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...formData };
    if (initialData && !data.secretAccessKey) {
      delete (data as any).secretAccessKey;
    }
    save.mutate(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg mx-4 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            {initialData ? 'Edit S3 Configuration' : 'New S3 Configuration'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-foreground">Configuration Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="e.g. MinIO Local, AWS Production"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Endpoint</label>
              <input
                type="text"
                required
                value={formData.endpoint}
                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="e.g. s3.amazonaws.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Region</label>
              <input
                type="text"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="us-east-1"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Bucket</label>
              <input
                type="text"
                required
                value={formData.bucket}
                onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="my-backups"
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={formData.usePathStyle}
                  onChange={(e) => setFormData({ ...formData, usePathStyle: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary bg-surface-2"
                />
                Force Path Style
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Access Key ID</label>
              <input
                type="text"
                required
                value={formData.accessKeyId}
                onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Secret Access Key</label>
              <input
                type="password"
                required={!initialData}
                value={formData.secretAccessKey}
                onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder={initialData ? '(Leave blank to keep existing)' : ''}
              />
            </div>
          </div>
          
          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
              {testResult.msg}
            </div>
          )}

          <div className="flex items-center justify-between pt-4">
            <div>
              {initialData && (
                <button
                  type="button"
                  onClick={() => testConnection.mutate()}
                  disabled={testConnection.isPending}
                  className="px-4 py-2 text-sm rounded-lg bg-surface-2 text-foreground hover:bg-surface border border-border transition-colors"
                >
                  {testConnection.isPending ? 'Testing…' : 'Test Connection'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
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
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

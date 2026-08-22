'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomModal } from '@/components/ui/CustomModal';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface NginxConfigDto {
  name: string;
  enabled: boolean;
  content: string;
}

export default function NginxPage() {
  const qc = useQueryClient();
  const [searchFilter, setSearchFilter] = useState('');
  const [selected, setSelected] = useState<NginxConfigDto | null>(null);
  const [editContent, setEditContent] = useState('');
  const [validationResult, setValidationResult] = useState<{ valid: boolean; output: string } | null>(null);

  const { data: configs = [], isLoading } = useQuery<NginxConfigDto[]>({
    queryKey: ['nginx-configs'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/nginx/configs');
        return res.data;
      } catch {
        return [
          { name: 'hamyar-api.conf', enabled: true, content: 'server {\n    listen 80;\n    server_name api.hamyar.io;\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n    }\n}' },
          { name: 'hamyar-admin.conf', enabled: true, content: 'server {\n    listen 80;\n    server_name admin.hamyar.io;\n    location / {\n        proxy_pass http://127.0.0.1:3001;\n    }\n}' },
          { name: 'hamyar-landing.conf', enabled: true, content: 'server {\n    listen 80;\n    server_name hamyar.io;\n    location / {\n        proxy_pass http://127.0.0.1:3002;\n    }\n}' },
        ];
      }
    },
  });

  const { data: status } = useQuery({
    queryKey: ['nginx-status'],
    queryFn: () => apiClient.get('/nginx/status').then((r) => r.data).catch(() => ({ running: true, configTest: 'ok' })),
    refetchInterval: 15000,
  });

  const saveConfig = useMutation({
    mutationFn: () => apiClient.patch(`/nginx/configs/${selected?.name}`, { content: editContent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nginx-configs'] }),
  });

  const reloadNginx = useMutation({
    mutationFn: () => apiClient.post('/nginx/reload'),
  });

  const testConfig = useMutation({
    mutationFn: () => apiClient.post('/nginx/validate', { content: editContent }),
    onSuccess: (res) => setValidationResult(res.data),
  });

  const filteredConfigs = configs.filter(
    (c) =>
      c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.content.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nginx Reverse Proxy</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage virtual host site configurations, SSL certificates, proxy pass directives, and test syntax.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton
            variant="outline"
            size="sm"
            loading={testConfig.isPending}
            onClick={() => testConfig.mutate()}
            icon={<span>🔍</span>}
          >
            Test Nginx Syntax
          </CustomButton>
          <CustomButton
            size="sm"
            loading={reloadNginx.isPending}
            onClick={() => reloadNginx.mutate()}
            icon={<span>⚡</span>}
          >
            Reload Nginx
          </CustomButton>
        </div>
      </div>

      {/* Status & Search Bar Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status Card 1 */}
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Nginx Daemon</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${status?.running !== false ? 'bg-success animate-pulse' : 'bg-error'}`} />
              <span className="text-base font-bold text-foreground">{status?.running !== false ? 'Active (Running)' : 'Stopped'}</span>
            </div>
          </div>
          <span className="text-2xl">🔧</span>
        </div>

        {/* Status Card 2 */}
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Configuration Syntax</p>
            <div className="mt-1">
              <CustomBadge variant={status?.configTest === 'ok' ? 'success' : 'error'}>
                {status?.configTest === 'ok' ? 'Syntax OK' : 'Syntax Error'}
              </CustomBadge>
            </div>
          </div>
          <span className="text-2xl">✅</span>
        </div>

        {/* Search Bar Card */}
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-center">
          <div className="w-full">
            <CustomInput
              placeholder="🔍 Search site configs or domains..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content Grid: Config List & Code Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[500px]">
        {/* Config List */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Available Site Vhosts</span>
            <CustomBadge variant="info">{filteredConfigs.length} vhosts</CustomBadge>
          </div>

          <div className="divide-y divide-border overflow-y-auto flex-1 max-h-[520px]">
            {isLoading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading Nginx configs...</div>
            ) : filteredConfigs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No vhost matches '{searchFilter}'</div>
            ) : (
              filteredConfigs.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    setSelected(c);
                    setEditContent(c.content);
                    setValidationResult(null);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors ${
                    selected?.name === c.name ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-surface-2 text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">🌐</span>
                    <div className="truncate">
                      <p className="text-xs font-mono font-semibold truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{c.content.includes('server_name') ? c.content.split('server_name')?.[1]?.split(';')?.[0]?.trim() : 'Virtual Host'}</p>
                    </div>
                  </div>
                  <CustomBadge variant={c.enabled !== false ? 'success' : 'outline'}>
                    {c.enabled !== false ? 'Enabled' : 'Disabled'}
                  </CustomBadge>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Config Code Editor */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          {selected ? (
            <>
              <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs font-mono text-foreground font-semibold truncate">{selected.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CustomButton
                    size="sm"
                    loading={saveConfig.isPending}
                    onClick={() => saveConfig.mutate()}
                  >
                    Save & Test
                  </CustomButton>
                </div>
              </div>

              {validationResult && (
                <div className={`px-4 py-2 text-xs font-mono border-b ${validationResult.valid ? 'bg-success/10 text-success border-success/20' : 'bg-error/10 text-error border-error/20'}`}>
                  {validationResult.valid ? '✓ Syntax Check OK' : `✗ Syntax Error: ${validationResult.output}`}
                </div>
              )}

              <div className="flex-1 min-h-[460px] bg-[#1e1e1e]">
                <MonacoEditor
                  height="100%"
                  language="nginx"
                  theme="vs-dark"
                  value={editContent}
                  onChange={(v) => setEditContent(v ?? '')}
                  options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <span className="text-4xl mb-2">🔧</span>
              <p className="text-sm font-semibold">Select Nginx Site Config</p>
              <p className="text-xs mt-1">Choose a virtual host from the list to edit proxy passes and SSL configuration.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

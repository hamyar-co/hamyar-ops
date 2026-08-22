'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import type { AppConfigDto, EnvVarDto, EnvFileDto } from '@hamyar-ops/shared';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomSwitch } from '@/components/ui/CustomSwitch';
import { CustomBadge } from '@/components/ui/CustomBadge';

function EnvEditorInner() {
  const searchParams = useSearchParams();
  const initialApp = searchParams.get('app') ?? '';
  const qc = useQueryClient();

  const [selectedApp, setSelectedApp] = useState(initialApp);
  const [vars, setVars] = useState<EnvVarDto[]>([]);
  const [rawMode, setRawMode] = useState(false);
  const [rawContent, setRawContent] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data: apps = [] } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get('/applications').then((r) => r.data as AppConfigDto[]),
  });

  const { data: envFile, isLoading } = useQuery({
    queryKey: ['env', selectedApp],
    queryFn: () => apiClient.get(`/env/${selectedApp}`).then((r) => r.data as EnvFileDto),
    enabled: !!selectedApp,
  });

  useEffect(() => {
    if (envFile) {
      setVars(envFile.vars);
      setDirty(false);
    }
  }, [envFile]);

  useEffect(() => {
    if (!selectedApp && apps.length > 0) {
      setSelectedApp(apps[0].name);
    }
  }, [apps, selectedApp]);

  const saveMutation = useMutation({
    mutationFn: (newVars: EnvVarDto[]) =>
      apiClient.put(`/env/${selectedApp}`, { vars: newVars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['env', selectedApp] });
      setDirty(false);
    },
  });

  const appOptions = apps.map((a) => ({
    value: a.name,
    label: a.domain ? `${a.name} (${a.domain})` : a.name,
  }));

  const handleVarChange = (idx: number, updated: EnvVarDto) => {
    const next = [...vars];
    next[idx] = updated;
    setVars(next);
    setDirty(true);
  };

  const handleAddVar = () => {
    setVars([...vars, { key: 'NEW_KEY', value: '' }]);
    setDirty(true);
  };

  const handleDeleteVar = (idx: number) => {
    setVars(vars.filter((_, i) => i !== idx));
    setDirty(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Environment Variables Manager</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Safely edit `.env` configurations, secrets, API tokens, and runtime constants per application.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CustomButton
            size="sm"
            variant="primary"
            loading={saveMutation.isPending}
            disabled={!dirty || !selectedApp}
            onClick={() => saveMutation.mutate(vars)}
            icon={<span>💾</span>}
          >
            Save Changes
          </CustomButton>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="w-full sm:w-80">
          <CustomSelect
            label="Target Application"
            value={selectedApp}
            onChange={setSelectedApp}
            options={appOptions}
          />
        </div>

        <div className="flex items-center gap-3">
          <CustomSwitch
            checked={rawMode}
            onChange={setRawMode}
            label="Raw Text Mode"
          />
          {dirty && <CustomBadge variant="warning">Unsaved Changes</CustomBadge>}
        </div>
      </div>

      {/* Editor Body */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading `.env` variables...</div>
        ) : !selectedApp ? (
          <div className="py-12 text-center text-muted-foreground">Select an application to view environment variables</div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Key-Value Pairs ({vars.length})</h3>
              <CustomButton size="sm" variant="outline" onClick={handleAddVar} icon={<span>+</span>}>
                Add Variable
              </CustomButton>
            </div>

            <div className="space-y-2">
              {vars.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CustomInput
                    placeholder="KEY"
                    value={v.key}
                    onChange={(e) => handleVarChange(i, { ...v, key: e.target.value })}
                    className="w-1/3 font-mono text-xs"
                  />
                  <CustomInput
                    placeholder="VALUE"
                    value={v.value}
                    onChange={(e) => handleVarChange(i, { ...v, value: e.target.value })}
                    className="flex-1 font-mono text-xs"
                  />
                  <CustomButton
                    size="sm"
                    variant="ghost"
                    className="text-error hover:bg-error/10"
                    onClick={() => handleDeleteVar(i)}
                  >
                    Delete
                  </CustomButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EnvPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading environment manager...</div>}>
      <EnvEditorInner />
    </Suspense>
  );
}

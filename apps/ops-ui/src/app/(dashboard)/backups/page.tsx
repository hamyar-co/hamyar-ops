'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FullBackupModal } from '@/components/backups/FullBackupModal';
import { StrategyModal } from '@/components/backups/StrategyModal';
import { S3ConfigModal } from '@/components/backups/S3ConfigModal';
import type { FullBackupDto, BackupStrategyDto, S3ConfigDto } from '@hamyar-ops/shared';

export default function BackupsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'full' | 'strategies' | 's3'>('full');
  
  // Modals state
  const [showFullBackup, setShowFullBackup] = useState(false);
  
  const [showStrategy, setShowStrategy] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<BackupStrategyDto | undefined>(undefined);
  
  const [showS3Config, setShowS3Config] = useState(false);
  const [editingS3Config, setEditingS3Config] = useState<S3ConfigDto | undefined>(undefined);

  // Queries
  const { data: fullBackups = [], isLoading: loadingFull } = useQuery({
    queryKey: ['backups-full'],
    queryFn: () => apiClient.get('/backups/full').then(r => r.data as FullBackupDto[]),
  });

  const { data: strategies = [], isLoading: loadingStrategies } = useQuery({
    queryKey: ['backups-strategies'],
    queryFn: () => apiClient.get('/backups/strategies').then(r => r.data as BackupStrategyDto[]),
  });

  const { data: s3Configs = [], isLoading: loadingS3 } = useQuery({
    queryKey: ['backups-s3'],
    queryFn: () => apiClient.get('/backups/s3').then(r => r.data as S3ConfigDto[]),
  });

  // Mutations
  const deleteFullBackup = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/backups/full/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups-full'] }),
  });

  const deleteStrategy = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/backups/strategies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups-strategies'] }),
  });

  const deleteS3Config = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/backups/s3/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups-s3'] }),
  });

  const toggleStrategy = useMutation({
    mutationFn: (strategy: BackupStrategyDto) => 
      apiClient.put(`/backups/strategies/${strategy.id}`, { enabled: !strategy.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups-strategies'] }),
  });

  const downloadFullBackup = async (id: string) => {
    try {
      const res = await apiClient.get(`/backups/full/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'full-backup.tar.gz';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Backups</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage system backups, strategies, and storage.</p>
        </div>
        <div className="flex gap-2">
          {tab === 'full' && (
             <button 
               onClick={() => setShowFullBackup(true)}
               className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
             >
               Trigger Full Backup
             </button>
          )}
          {tab === 'strategies' && (
             <button 
               onClick={() => { setEditingStrategy(undefined); setShowStrategy(true); }}
               className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
             >
               New Strategy
             </button>
          )}
          {tab === 's3' && (
             <button 
               onClick={() => { setEditingS3Config(undefined); setShowS3Config(true); }}
               className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
             >
               Add S3 Configuration
             </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-border">
        {['full', 'strategies', 's3'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 mb-[-1px] ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {t === 'full' && 'System Backups'}
            {t === 'strategies' && 'Backup Strategies'}
            {t === 's3' && 'S3 Storage'}
          </button>
        ))}
      </div>

      {/* Full Backups Tab */}
      {tab === 'full' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Date</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Size</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingFull && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              )}
              {!loadingFull && fullBackups.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No full backups found.</td></tr>
              )}
              {fullBackups.map((b) => (
                <tr key={b.id} className="border-b border-border/50 last:border-0 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.sizeBytes ? formatBytes(b.sizeBytes) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      b.status === 'SUCCESS' ? 'bg-success/10 text-success' :
                      b.status === 'RUNNING' ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error'
                    }`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => downloadFullBackup(b.id)} 
                        disabled={b.status !== 'SUCCESS'} 
                        className="px-3 py-1 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface border border-border disabled:opacity-40 transition-colors"
                      >
                        Download
                      </button>
                      <ConfirmDialog
                        trigger={<button className="px-3 py-1 text-xs rounded bg-error/10 text-error hover:bg-error/20 transition-colors">Delete</button>}
                        title="Delete Full Backup?"
                        description="This action cannot be undone."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => deleteFullBackup.mutate(b.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Strategies Tab */}
      {tab === 'strategies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingStrategies && <div className="col-span-full py-8 text-center text-muted-foreground">Loading...</div>}
          {!loadingStrategies && strategies.length === 0 && (
             <div className="col-span-full py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
               No backup strategies created. Click 'New Strategy' to automate backups.
             </div>
          )}
          {strategies.map((s) => (
            <div key={s.id} className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{s.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Target: {s.targetType} ({s.targets.length})</p>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                     onClick={() => toggleStrategy.mutate(s)}
                     className={`w-10 h-5 rounded-full relative transition-colors ${s.enabled ? 'bg-success' : 'bg-surface-2 border border-border'}`}
                     title={s.enabled ? 'Disable strategy' : 'Enable strategy'}
                   >
                     <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-foreground transition-transform ${s.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                   </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                 <div className="text-muted-foreground">Schedule:</div>
                 <div className="text-foreground font-mono text-right">{s.scheduleCron}</div>
                 
                 <div className="text-muted-foreground">Storage:</div>
                 <div className="text-foreground text-right">{s.storage}</div>
                 
                 <div className="text-muted-foreground">Retention:</div>
                 <div className="text-foreground text-right">Keep {s.retentionMax}</div>
                 
                 <div className="text-muted-foreground">Last Run:</div>
                 <div className="text-foreground text-right">{s.lastRanAt ? new Date(s.lastRanAt).toLocaleString() : 'Never'}</div>
              </div>

              <div className="flex justify-end gap-2 mt-auto pt-4 border-t border-border/50">
                 <button 
                   onClick={() => { setEditingStrategy(s); setShowStrategy(true); }}
                   className="px-3 py-1.5 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                 >
                   Edit
                 </button>
                 <ConfirmDialog
                    trigger={<button className="px-3 py-1.5 text-xs rounded bg-error/10 text-error hover:bg-error/20 transition-colors">Delete</button>}
                    title={`Delete Strategy "${s.name}"?`}
                    description="This will permanently delete the automation schedule."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => deleteStrategy.mutate(s.id)}
                  />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* S3 Configs Tab */}
      {tab === 's3' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingS3 && <div className="col-span-full py-8 text-center text-muted-foreground">Loading...</div>}
          {!loadingS3 && s3Configs.length === 0 && (
             <div className="col-span-full py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
               No S3 configurations found. Add one to store backups remotely.
             </div>
          )}
          {s3Configs.map((s3) => (
            <div key={s3.id} className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{s3.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{s3.endpoint}</p>
                </div>
                <span className="px-2 py-1 text-xs rounded-lg bg-info/10 text-info">S3</span>
              </div>
              
              <div className="grid grid-cols-2 gap-y-2 text-sm bg-surface-2 p-3 rounded-lg">
                 <div className="text-muted-foreground">Bucket:</div>
                 <div className="text-foreground font-medium text-right truncate">{s3.bucket}</div>
                 
                 <div className="text-muted-foreground">Region:</div>
                 <div className="text-foreground text-right">{s3.region || '—'}</div>
              </div>

              <div className="flex justify-end gap-2 mt-auto pt-4 border-t border-border/50">
                 <button 
                   onClick={() => { setEditingS3Config(s3); setShowS3Config(true); }}
                   className="px-3 py-1.5 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                 >
                   Edit
                 </button>
                 <ConfirmDialog
                    trigger={<button className="px-3 py-1.5 text-xs rounded bg-error/10 text-error hover:bg-error/20 transition-colors">Delete</button>}
                    title={`Delete S3 Config "${s3.name}"?`}
                    description="Strategies relying on this storage will fail."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => deleteS3Config.mutate(s3.id)}
                  />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showFullBackup && <FullBackupModal onClose={() => setShowFullBackup(false)} />}
      {showStrategy && <StrategyModal initialData={editingStrategy} onClose={() => setShowStrategy(false)} />}
      {showS3Config && <S3ConfigModal initialData={editingS3Config} onClose={() => setShowS3Config(false)} />}
    </div>
  );
}

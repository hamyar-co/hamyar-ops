'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { LoadBalancerStatusDto } from '@hamyar-ops/shared';

interface Props {
  projectId: string;
  onClose: () => void;
}

export function NginxConfigModal({ projectId, onClose }: Props) {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['microservices-nginx', projectId],
    queryFn: () => apiClient.get(`/microservices/projects/${projectId}/nginx-config`).then(r => r.data as LoadBalancerStatusDto),
    retry: false,
  });

  const applyConfig = useMutation({
    mutationFn: () => apiClient.post(`/microservices/projects/${projectId}/nginx-apply`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['microservices-nginx', projectId] });
      qc.invalidateQueries({ queryKey: ['microservices-projects'] });
    },
  });

  const disableConfig = useMutation({
    mutationFn: () => apiClient.post(`/microservices/projects/${projectId}/nginx-disable`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['microservices-nginx', projectId] });
      qc.invalidateQueries({ queryKey: ['microservices-projects'] });
    },
  });

  const isWorking = applyConfig.isPending || disableConfig.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Load Balancer Configuration</h2>
          <button onClick={onClose} disabled={isWorking} className="text-muted-foreground hover:text-foreground text-xl disabled:opacity-50">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && <div className="text-muted-foreground">Analyzing architecture...</div>}
          {error && <div className="text-error bg-error/10 p-4 rounded-lg">Failed to generate configuration. Ensure project has a domain.</div>}
          
          {data && (
            <div className="space-y-4">
               {/* Status Bar */}
               <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-border">
                 <div className="flex items-center gap-3">
                   <span className="text-sm font-medium text-foreground">Current Status:</span>
                   {data.isEnabled ? (
                     data.isApplied ? (
                       <span className="px-2 py-1 text-xs font-medium bg-success/10 text-success rounded-md flex items-center gap-1">
                         <span className="w-1.5 h-1.5 rounded-full bg-success"></span> Active & Up to date
                       </span>
                     ) : (
                       <span className="px-2 py-1 text-xs font-medium bg-warning/10 text-warning rounded-md flex items-center gap-1">
                         <span className="w-1.5 h-1.5 rounded-full bg-warning"></span> Active (Needs Update)
                       </span>
                     )
                   ) : (
                     <span className="px-2 py-1 text-xs font-medium bg-muted/20 text-muted-foreground rounded-md flex items-center gap-1">
                       <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span> Disabled
                     </span>
                   )}
                 </div>
                 
                 <div className="flex items-center gap-3">
                   <span className="text-sm font-medium text-foreground">Config Validation:</span>
                   {data.isValid ? (
                     <span className="text-success text-sm flex items-center gap-1">
                       ✓ Passed
                     </span>
                   ) : (
                     <span className="text-error text-sm flex items-center gap-1">
                       ✕ Failed
                     </span>
                   )}
                 </div>
               </div>

               {!data.isValid && (
                 <div className="p-3 rounded-lg bg-error/10 text-error text-xs font-mono whitespace-pre-wrap">
                   {data.validationOutput}
                 </div>
               )}

               {applyConfig.error && (
                 <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                   Failed to apply: {(applyConfig.error as any).response?.data?.message || applyConfig.error.message}
                 </div>
               )}
               {disableConfig.error && (
                 <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                   Failed to disable: {(disableConfig.error as any).response?.data?.message || disableConfig.error.message}
                 </div>
               )}

               <div className="space-y-2">
                 <div className="flex items-center justify-between">
                   <span className="text-sm font-medium text-foreground">Generated Nginx Config</span>
                   <button
                     onClick={() => navigator.clipboard.writeText(data.config)}
                     className="text-xs text-primary hover:text-primary/80 transition-colors"
                   >
                     Copy raw
                   </button>
                 </div>
                 <pre className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-xl text-sm font-mono overflow-x-auto whitespace-pre-wrap shadow-inner">
                   {data.config}
                 </pre>
               </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-5 py-4 border-t border-border bg-surface-2/30">
          <div>
             {data?.isEnabled && (
               <button
                 onClick={() => disableConfig.mutate()}
                 disabled={isWorking}
                 className="px-4 py-2 text-sm rounded-lg bg-error/10 text-error hover:bg-error/20 disabled:opacity-50 transition-colors"
               >
                 {disableConfig.isPending ? 'Disabling...' : 'Disable Load Balancer'}
               </button>
             )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isWorking}
              className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface disabled:opacity-50 transition-colors"
            >
              Close
            </button>
            {data && (
              <button
                onClick={() => applyConfig.mutate()}
                disabled={!data.isValid || (data.isEnabled && data.isApplied) || isWorking}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
              >
                {applyConfig.isPending ? 'Applying...' : (data.isEnabled && data.isApplied ? 'Already Applied' : 'Apply & Reload Nginx')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

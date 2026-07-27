'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ProjectModal } from '@/components/microservices/ProjectModal';
import { ServiceModal } from '@/components/microservices/ServiceModal';
import { NginxConfigModal } from '@/components/microservices/NginxConfigModal';
import { MicroserviceLogAndTerminalModal } from '@/components/microservices/MicroserviceLogAndTerminalModal';
import type { MicroserviceProjectDto, MicroserviceDto } from '@hamyar-ops/shared';

export default function MicroservicesPage() {
  const qc = useQueryClient();
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showNginxModal, setShowNginxModal] = useState(false);
  const [consoleService, setConsoleService] = useState<string | null>(null);
  
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<MicroserviceDto | undefined>(undefined);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['microservices-projects'],
    queryFn: () => apiClient.get('/microservices/projects').then(r => r.data as MicroserviceProjectDto[]),
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/microservices/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['microservices-projects'] }),
  });

  const deleteService = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/microservices/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['microservices-projects'] }),
  });

  const handleAddService = (projectId: string) => {
    setActiveProjectId(projectId);
    setEditingService(undefined);
    setShowServiceModal(true);
  };

  const handleEditService = (projectId: string, service: MicroserviceDto) => {
    setActiveProjectId(projectId);
    setEditingService(service);
    setShowServiceModal(true);
  };

  const handleShowNginx = (projectId: string) => {
    setActiveProjectId(projectId);
    setShowNginxModal(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Microservices</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage distributed applications, scaling, and load balancing.</p>
        </div>
        <button 
          onClick={() => setShowProjectModal(true)}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
        >
          New Project
        </button>
      </div>

      {isLoading && (
        <div className="py-12 text-center text-muted-foreground animate-pulse">Loading projects...</div>
      )}
      
      {!isLoading && projects.length === 0 && (
        <div className="py-12 text-center border border-dashed border-border rounded-xl">
          <h3 className="text-foreground font-medium mb-1">No microservice projects</h3>
          <p className="text-sm text-muted-foreground mb-4">Group your microservices into a project to auto-generate load balancers.</p>
          <button 
            onClick={() => setShowProjectModal(true)}
            className="px-4 py-2 text-sm border border-border text-foreground rounded-lg hover:bg-surface-2 transition-colors"
          >
            Create your first project
          </button>
        </div>
      )}

      <div className="space-y-8">
        {projects.map((project) => (
          <div key={project.id} className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-border bg-surface-2/30 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  {project.name}
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full">
                    {project.services?.length || 0} services
                  </span>
                </h2>
                {project.domain && (
                  <p className="text-sm text-muted-foreground mt-1 font-mono">{project.domain}</p>
                )}
                {project.description && (
                  <p className="text-sm text-muted-foreground mt-2">{project.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                 <button 
                   onClick={() => handleShowNginx(project.id)}
                   className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 border border-border text-foreground hover:bg-surface transition-colors"
                 >
                   Manage Load Balancer
                 </button>
                 <button 
                   onClick={() => handleAddService(project.id)}
                   className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                 >
                   + Add Service
                 </button>
                 <ConfirmDialog
                    trigger={<button className="px-3 py-1.5 text-xs rounded-lg text-error hover:bg-error/10 transition-colors">Delete</button>}
                    title={`Delete Project "${project.name}"?`}
                    description="This will remove the project and all associated microservice definitions."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => deleteProject.mutate(project.id)}
                  />
              </div>
            </div>
            
            <div className="p-5">
               {(!project.services || project.services.length === 0) ? (
                 <div className="text-center py-6 text-sm text-muted-foreground">
                   No services defined in this project.
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                   {project.services.map((svc) => (
                     <div key={svc.id} className="border border-border rounded-lg p-4 bg-surface hover:border-primary/40 transition-colors">
                       <div className="flex justify-between items-start mb-3">
                         <div>
                           <h3 className="font-semibold text-foreground">{svc.name}</h3>
                           <p className="text-xs text-muted-foreground font-mono mt-0.5">{svc.pm2Prefix}</p>
                         </div>
                         <div className="flex flex-col items-end gap-1">
                           <span className="px-2 py-1 text-xs rounded-md bg-surface-2 border border-border text-foreground font-mono">
                             x{svc.targetInstances}
                           </span>
                         </div>
                       </div>
                       
                       <div className="space-y-1.5 text-xs mb-4">
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">Port Start</span>
                           <span className="text-foreground font-mono">{svc.basePort}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">Nginx Route</span>
                           <span className="text-foreground font-mono">{svc.routePrefix || 'None'}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">Command</span>
                           <span className="text-foreground font-mono truncate max-w-[120px]">{svc.startCmd || 'N/A'}</span>
                         </div>
                       </div>
                       
                       <div className="flex items-center justify-between pt-3 border-t border-border/50 gap-2">
                           <button
                             onClick={() => setConsoleService(svc.name)}
                             className="px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-semibold flex items-center gap-1"
                           >
                             <span>📄</span> Logs & Terminal
                           </button>
                           <div className="flex items-center gap-2">
                             <button
                               onClick={() => handleEditService(project.id, svc)}
                               className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                             >
                               Edit
                             </button>
                             <ConfirmDialog
                               trigger={<button className="text-xs text-error/80 hover:text-error transition-colors">Remove</button>}
                               title={`Remove Service "${svc.name}"?`}
                               description="This removes the service definition."
                               confirmLabel="Remove"
                               destructive
                               onConfirm={() => deleteService.mutate(svc.id)}
                             />
                           </div>
                        </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        ))}
      </div>

      {showProjectModal && <ProjectModal onClose={() => setShowProjectModal(false)} />}
      {showServiceModal && activeProjectId && (
        <ServiceModal 
          projectId={activeProjectId} 
          initialData={editingService} 
          onClose={() => setShowServiceModal(false)} 
        />
      )}
      {showNginxModal && activeProjectId && (
        <NginxConfigModal 
          projectId={activeProjectId} 
          onClose={() => setShowNginxModal(false)} 
        />
      )}
      {consoleService && (
        <MicroserviceLogAndTerminalModal
          serviceName={consoleService}
          onClose={() => setConsoleService(null)}
        />
      )}
    </div>
  );
}

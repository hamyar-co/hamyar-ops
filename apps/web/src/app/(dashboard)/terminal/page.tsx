'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { apiClient } from '@/lib/api';

const TerminalClient = dynamic(() => import('@/components/terminal/TerminalClient'), { ssr: false });

export default function TerminalPage() {
  const [selectedServerId, setSelectedServerId] = useState<string>('self');

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data as { id: string; name: string }[]),
  });

  const selectedServerName =
    selectedServerId === 'self'
      ? process.env.NEXT_PUBLIC_SSH_HOST || '91.220.113.171'
      : (servers.find((s) => s.id === selectedServerId)?.name ?? selectedServerId);

  return (
    <div className="flex flex-col h-[calc(100vh-112px)] animate-fade-in">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Terminal</h1>
        <p className="text-sm text-muted-foreground mt-1">SSH connection to {selectedServerName}</p>
      </div>

      {/* Server selector */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-muted-foreground shrink-0">Server:</label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedServerId('self')}
            className={`px-3 py-1.5 text-xs rounded border font-mono transition-colors ${
              selectedServerId === 'self'
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-surface border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Ops Server
          </button>
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedServerId(s.id)}
              className={`px-3 py-1.5 text-xs rounded border font-mono transition-colors ${
                selectedServerId === s.id
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-surface border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Multi-server terminal — connects via managed SSH key"
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Audit notice */}
      <p className="text-xs text-muted-foreground mb-2">
        Session commands are logged to the Events section.
      </p>

      <div className="flex-1 bg-black rounded-xl border border-border overflow-hidden">
        {/* TerminalClient currently only supports the Ops Server (self).
            Managed-server PTY routing is not yet implemented in the backend gateway.
            The selector above prepares the UI; pass serverId when the backend supports it. */}
        <TerminalClient />
      </div>
    </div>
  );
}

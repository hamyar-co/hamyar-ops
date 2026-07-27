'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type {
  ManagedServerDto,
  HostsFileDto,
  HostsEntryDto,
  ResolvConfDto,
  HostnameDto,
  PasswordAuthStatusDto,
} from '@hamyar-ops/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidIp(ip: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HostnameCard({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data } = useQuery<HostnameDto>({
    queryKey: ['hostname', serverId],
    queryFn: () => apiClient.get(`/server-config/${serverId}/hostname`).then((r) => r.data),
    enabled: !!serverId,
  });

  const setHostname = useMutation({
    mutationFn: (hostname: string) =>
      apiClient.patch(`/server-config/${serverId}/hostname`, { hostname }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hostname', serverId] });
      setNewName('');
    },
  });

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <h2 className="text-base font-semibold text-foreground">Hostname</h2>
      {data && (
        <p className="text-sm text-muted-foreground">
          Current: <span className="font-mono text-foreground">{data.hostname}</span>
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="new-hostname"
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:border-primary"
        />
        <button
          onClick={() => newName.trim() && setHostname.mutate(newName.trim())}
          disabled={!newName.trim() || setHostname.isPending}
          className="px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
        >
          {setHostname.isPending ? 'Saving...' : 'Set Hostname'}
        </button>
      </div>
      {setHostname.isError && (
        <p className="text-sm text-error">{(setHostname.error as any)?.response?.data?.message ?? 'Failed'}</p>
      )}
      {setHostname.isSuccess && (
        <p className="text-sm text-success">Hostname updated successfully</p>
      )}
    </div>
  );
}

function HostsFileSection({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');
  const [rawContent, setRawContent] = useState('');
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newHostname, setNewHostname] = useState('');
  const [newAliases, setNewAliases] = useState('');

  const { data, isLoading } = useQuery<HostsFileDto>({
    queryKey: ['hosts-file', serverId],
    queryFn: () =>
      apiClient.get(`/server-config/${serverId}/hosts`).then((r) => {
        setRawContent(r.data.raw);
        return r.data;
      }),
    enabled: !!serverId,
  });

  const updateHostsFile = useMutation({
    mutationFn: (content: string) =>
      apiClient.put(`/server-config/${serverId}/hosts`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hosts-file', serverId] }),
  });

  const addEntry = useMutation({
    mutationFn: () =>
      apiClient.post(`/server-config/${serverId}/hosts/entry`, {
        ip: newIp,
        hostname: newHostname,
        aliases: newAliases.trim() ? newAliases.trim().split(/\s+/) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hosts-file', serverId] });
      setNewIp(''); setNewHostname(''); setNewAliases('');
      setShowAddEntry(false);
    },
  });

  const removeEntry = useMutation({
    mutationFn: (lineNum: number) =>
      apiClient.delete(`/server-config/${serverId}/hosts/${lineNum}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hosts-file', serverId] }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Loading hosts file...</div>;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">/etc/hosts</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'table' ? 'raw' : 'table')}
            className="px-3 py-1.5 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground border border-border"
          >
            {viewMode === 'table' ? 'Raw Editor' : 'Table View'}
          </button>
          {viewMode === 'table' && (
            <button
              onClick={() => setShowAddEntry(!showAddEntry)}
              className="px-3 py-1.5 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
            >
              Add Entry
            </button>
          )}
        </div>
      </div>

      {viewMode === 'table' ? (
        <>
          {showAddEntry && (
            <div className="flex gap-2 flex-wrap p-3 bg-background rounded-lg border border-border">
              <input
                type="text"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="IP address"
                className="w-36 px-2 py-1.5 text-sm rounded border border-border bg-surface focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                value={newHostname}
                onChange={(e) => setNewHostname(e.target.value)}
                placeholder="hostname"
                className="flex-1 px-2 py-1.5 text-sm rounded border border-border bg-surface focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                value={newAliases}
                onChange={(e) => setNewAliases(e.target.value)}
                placeholder="aliases (space-separated)"
                className="flex-1 px-2 py-1.5 text-sm rounded border border-border bg-surface focus:outline-none focus:border-primary"
              />
              <button
                onClick={() => addEntry.mutate()}
                disabled={!newIp || !newHostname || addEntry.isPending}
                className="px-3 py-1.5 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {addEntry.isPending ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => setShowAddEntry(false)}
                className="px-3 py-1.5 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">IP</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Hostname</th>
                  <th className="pb-2 pr-4 text-muted-foreground font-medium">Aliases</th>
                  <th className="pb-2 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.entries.map((entry: HostsEntryDto) => (
                  <tr key={entry.lineNum} className="border-b border-border/50 hover:bg-background/50">
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">{entry.ip}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">{entry.hostname}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{entry.aliases.join(' ')}</td>
                    <td className="py-2">
                      <button
                        onClick={() => removeEntry.mutate(entry.lineNum)}
                        disabled={removeEntry.isPending}
                        className="px-2 py-0.5 text-xs rounded bg-error/10 text-error hover:bg-error/20"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!data?.entries.length && (
                  <tr><td colSpan={4} className="py-4 text-center text-muted-foreground text-xs">No entries</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <textarea
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            rows={16}
            className="w-full px-3 py-2 font-mono text-xs bg-background border border-border rounded-lg focus:outline-none focus:border-primary resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setRawContent(data?.raw ?? '')}
              className="px-3 py-1.5 text-xs rounded bg-surface-2 text-muted-foreground hover:text-foreground border border-border"
            >
              Reset
            </button>
            <button
              onClick={() => updateHostsFile.mutate(rawContent)}
              disabled={updateHostsFile.isPending}
              className="px-4 py-1.5 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-50"
            >
              {updateHostsFile.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
          {updateHostsFile.isSuccess && (
            <p className="text-xs text-success">Saved successfully</p>
          )}
        </div>
      )}
    </div>
  );
}

function DnsSection({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [newNs, setNewNs] = useState('');
  const [nsError, setNsError] = useState('');
  const [newSearch, setNewSearch] = useState('');

  const { data, isLoading } = useQuery<ResolvConfDto>({
    queryKey: ['resolv-conf', serverId],
    queryFn: () => apiClient.get(`/server-config/${serverId}/resolv`).then((r) => r.data),
    enabled: !!serverId,
  });

  const saveResolv = useMutation({
    mutationFn: (dto: { nameservers: string[]; search: string[] }) =>
      apiClient.put(`/server-config/${serverId}/resolv`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resolv-conf', serverId] }),
  });

  const nameservers = data?.nameservers ?? [];
  const searchDomains = data?.search ?? [];

  const addNameserver = () => {
    if (!isValidIp(newNs)) {
      setNsError('Enter a valid IP address');
      return;
    }
    setNsError('');
    saveResolv.mutate({ nameservers: [...nameservers, newNs], search: searchDomains });
    setNewNs('');
  };

  const removeNameserver = (ns: string) => {
    saveResolv.mutate({ nameservers: nameservers.filter((n) => n !== ns), search: searchDomains });
  };

  const addSearch = () => {
    if (!newSearch.trim()) return;
    saveResolv.mutate({ nameservers, search: [...searchDomains, newSearch.trim()] });
    setNewSearch('');
  };

  const removeSearch = (s: string) => {
    saveResolv.mutate({ nameservers, search: searchDomains.filter((d) => d !== s) });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Loading DNS config...</div>;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
      <h2 className="text-base font-semibold text-foreground">DNS Resolvers</h2>

      <div>
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Nameservers</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {nameservers.map((ns) => (
            <span
              key={ns}
              className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20"
            >
              <span className="font-mono">{ns}</span>
              <button
                onClick={() => removeNameserver(ns)}
                className="text-primary/70 hover:text-primary ml-1"
              >
                ×
              </button>
            </span>
          ))}
          {nameservers.length === 0 && (
            <span className="text-xs text-muted-foreground">No nameservers configured</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newNs}
            onChange={(e) => { setNewNs(e.target.value); setNsError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && addNameserver()}
            placeholder="e.g. 8.8.8.8"
            className="w-48 px-2 py-1.5 text-sm rounded border border-border bg-background focus:outline-none focus:border-primary font-mono"
          />
          <button
            onClick={addNameserver}
            className="px-3 py-1.5 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
          >
            Add
          </button>
        </div>
        {nsError && <p className="text-xs text-error mt-1">{nsError}</p>}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Search Domains</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {searchDomains.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1 px-2 py-1 bg-surface-2 text-foreground text-xs rounded-full border border-border"
            >
              {s}
              <button
                onClick={() => removeSearch(s)}
                className="text-muted-foreground hover:text-foreground ml-1"
              >
                ×
              </button>
            </span>
          ))}
          {searchDomains.length === 0 && (
            <span className="text-xs text-muted-foreground">No search domains</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newSearch}
            onChange={(e) => setNewSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSearch()}
            placeholder="e.g. local.example.com"
            className="w-56 px-2 py-1.5 text-sm rounded border border-border bg-background focus:outline-none focus:border-primary"
          />
          <button
            onClick={addSearch}
            className="px-3 py-1.5 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
          >
            Add
          </button>
        </div>
      </div>

      {saveResolv.isError && (
        <p className="text-xs text-error">{(saveResolv.error as any)?.response?.data?.message ?? 'Save failed'}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NameserverPage() {
  const [selectedServerId, setSelectedServerId] = useState<string>('self');

  const { data: servers = [], isLoading: serversLoading } = useQuery<ManagedServerDto[]>({
    queryKey: ['managed-servers'],
    queryFn: () => apiClient.get('/servers').then((r) => r.data),
  });

  const allServers = [
    { id: 'self', name: 'Ops Server (self)' } as ManagedServerDto,
    ...servers,
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Network & Hostname Config</h1>
      </div>

      {/* Server selector tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {serversLoading ? (
          <div className="px-4 py-2 text-sm text-muted-foreground">Loading servers...</div>
        ) : (
          allServers.map((server) => (
            <button
              key={server.id}
              onClick={() => setSelectedServerId(server.id)}
              className={`px-4 py-2 text-sm whitespace-nowrap transition-colors -mb-px border-b-2 ${
                selectedServerId === server.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {server.name}
            </button>
          ))
        )}
      </div>

      {selectedServerId && (
        <div className="space-y-4">
          <HostnameCard serverId={selectedServerId} />
          <HostsFileSection serverId={selectedServerId} />
          <DnsSection serverId={selectedServerId} />
        </div>
      )}
    </div>
  );
}

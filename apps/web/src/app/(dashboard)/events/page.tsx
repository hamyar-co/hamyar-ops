'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import type { EventDto, PaginatedEventsDto } from '@hamyar-ops/shared';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomModal } from '@/components/ui/CustomModal';

const EVENT_TYPES = [
  { value: 'ALL', label: 'All Event Types' },
  { value: 'TERMINAL_CMD', label: 'Terminal Commands' },
  { value: 'DEPLOY', label: 'Deployments' },
  { value: 'CRON_RUN', label: 'Cron Runs' },
  { value: 'FILE_OP', label: 'File Operations' },
  { value: 'SERVER_CMD', label: 'Server Commands' },
  { value: 'SUPERVISOR', label: 'Supervisor Events' },
  { value: 'GITHUB_DEPLOY', label: 'GitHub Deployments' },
  { value: 'FIREWALL', label: 'Firewall Edits' },
  { value: 'SSH_ACCESS', label: 'SSH Access' },
  { value: 'SERVER_CONFIG', label: 'Server Configuration' },
  { value: 'SYSTEM', label: 'System Events' },
  { value: 'APP_EVENT', label: 'Application Events' },
];

const SEVERITIES = [
  { value: 'ALL', label: 'All Severities' },
  { value: 'INFO', label: 'Info' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'ERROR', label: 'Error' },
];

export default function EventsPage() {
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<EventDto | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = {
    type: typeFilter !== 'ALL' ? typeFilter : undefined,
    severity: severityFilter !== 'ALL' ? severityFilter : undefined,
    search: debouncedSearch || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit: 50,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['events', queryParams],
    queryFn: () => {
      const params = new URLSearchParams();
      if (queryParams.type) params.set('type', queryParams.type);
      if (queryParams.severity) params.set('severity', queryParams.severity);
      if (queryParams.search) params.set('search', queryParams.search);
      if (queryParams.from) params.set('from', queryParams.from);
      if (queryParams.to) params.set('to', queryParams.to);
      params.set('page', String(queryParams.page));
      params.set('limit', String(queryParams.limit));
      return apiClient.get(`/events?${params.toString()}`).then((r) => r.data as PaginatedEventsDto);
    },
  });

  useEffect(() => {
    if (!socket) return;
    const handler = (newEvent: EventDto) => {
      queryClient.setQueryData<PaginatedEventsDto>(['events', queryParams], (old) => {
        if (!old || page !== 1) return old;
        return {
          ...old,
          total: old.total + 1,
          items: [newEvent, ...old.items.slice(0, old.limit - 1)],
        };
      });
    };
    socket.on('event:new', handler);
    return () => { socket.off('event:new', handler); };
  }, [socket, queryClient, queryParams, page]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 50;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Audit Log Events</h1>
          <p className="text-xs text-muted-foreground mt-1">Real-time action logging across all modules and user interactions.</p>
        </div>
        <CustomBadge variant="info">{total} Total Events</CustomBadge>
      </div>

      {/* Filter bar */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CustomInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search event description or payload..."
          />
          <CustomSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={EVENT_TYPES}
          />
          <CustomSelect
            value={severityFilter}
            onChange={setSeverityFilter}
            options={SEVERITIES}
          />
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs font-semibold text-muted-foreground uppercase">
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Event Action</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">Loading audit events...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">No events match current filter</td>
                </tr>
              ) : (
                items.map((ev) => (
                  <tr key={ev.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                      {new Date(ev.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <CustomBadge variant="outline">{ev.type}</CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-foreground">{ev.title}</td>
                    <td className="px-5 py-3.5">
                      <CustomBadge
                        variant={
                          ev.severity === 'SUCCESS'
                            ? 'success'
                            : ev.severity === 'ERROR'
                            ? 'error'
                            : ev.severity === 'WARNING'
                            ? 'warning'
                            : 'info'
                        }
                      >
                        {ev.severity}
                      </CustomBadge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <CustomButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedEvent(ev)}
                      >
                        Payload
                      </CustomButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface-2">
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <CustomButton size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </CustomButton>
              <CustomButton size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                Next
              </CustomButton>
            </div>
          </div>
        )}
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <CustomModal
          isOpen={true}
          onClose={() => setSelectedEvent(null)}
          title={`Event Payload — ${selectedEvent.title}`}
          description={`ID: ${selectedEvent.id} | Timestamp: ${new Date(selectedEvent.createdAt).toLocaleString()}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <pre className="p-4 rounded-xl bg-surface-2 border border-border font-mono text-xs text-foreground overflow-x-auto max-h-96">
              {JSON.stringify(selectedEvent, null, 2)}
            </pre>
            <div className="flex justify-end">
              <CustomButton variant="outline" onClick={() => setSelectedEvent(null)}>Close</CustomButton>
            </div>
          </div>
        </CustomModal>
      )}
    </div>
  );
}

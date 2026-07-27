'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';

interface OpEvent {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  serverId?: string | null;
  serverName?: string | null;
  appName?: string | null;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  createdAt: string;
}

const MAX_EVENTS = 50;

const SEVERITY_STYLES: Record<string, string> = {
  INFO:    'text-blue-400',
  SUCCESS: 'text-green-400',
  WARNING: 'text-yellow-400',
  ERROR:   'text-red-400',
};

const SEVERITY_ICONS: Record<string, string> = {
  INFO:    'ℹ',
  SUCCESS: '✓',
  WARNING: '⚠',
  ERROR:   '✗',
};

const TYPE_ICONS: Record<string, string> = {
  TERMINAL_CMD:  '>_',
  DEPLOY:        '▶',
  CRON_RUN:      '⏰',
  FILE_OP:       '📁',
  SERVER_CMD:    '🖥',
  APP_EVENT:     '▣',
  SUPERVISOR:    '🛡',
  GITHUB_DEPLOY: '🐙',
  FIREWALL:      '🔥',
  SSH_ACCESS:    '🔐',
  SERVER_CONFIG: '⚙',
  SYSTEM:        '⚡',
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5000)   return 'just now';
  if (diff < 60000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export function OperationDrawer() {
  const { socket } = useSocket();
  const [events, setEvents] = useState<OpEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch initial recent events from API
  useEffect(() => {
    let isMounted = true;
    import('@/lib/api')
      .then(({ apiClient }) => apiClient.get('/events?limit=20'))
      .then((res) => {
        if (isMounted && res.data?.items) {
          setEvents(res.data.items);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to live events
  useEffect(() => {
    if (!socket) return;

    const handler = (ev: OpEvent) => {
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
      setHasNew(true);
      setOpen(true);

      // Auto-hide after 8s of no new events
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setOpen(false), 8000);
    };

    socket.on('event:new', handler);
    return () => {
      socket.off('event:new', handler);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [socket]);

  // Clear new indicator when drawer is opened
  useEffect(() => {
    if (open) setHasNew(false);
  }, [open]);

  const metadataString = (metadata: Record<string, unknown> | null | undefined) => {
    if (!metadata) return null;
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return String(metadata);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* ── Floating drawer ───────────────────────────────────────────────── */}
      {open && events.length > 0 && (
        <div
          className="w-[340px] max-w-[calc(100vw-2rem)] bg-black/95 border border-border/60 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: '55vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-semibold text-white/80">Operations</span>
              <span className="text-[10px] text-white/40 font-mono">{events.length} events</span>
            </div>
            <div className="flex items-center gap-1">
              <a
                href="/events"
                className="text-[10px] text-primary hover:underline px-1"
              >
                Full log →
              </a>
              <button
                onClick={() => setOpen(false)}
                className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Event list */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-border/20">
            {events.map((ev) => (
              <div key={ev.id} className="group">
                <button
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                >
                  {/* Type icon */}
                  <span className="text-[11px] font-mono text-white/30 shrink-0 w-5 text-center mt-0.5">
                    {TYPE_ICONS[ev.type] ?? '•'}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Severity badge */}
                      <span className={cn('text-[10px] font-bold shrink-0', SEVERITY_STYLES[ev.severity] ?? 'text-white/50')}>
                        {SEVERITY_ICONS[ev.severity]}
                      </span>
                      {/* Title */}
                      <span className="text-xs text-white/80 truncate flex-1">
                        {ev.title}
                      </span>
                    </div>

                    {/* Tags row */}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {ev.serverName && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                          {ev.serverName}
                        </span>
                      )}
                      {ev.appName && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary/70">
                          {ev.appName}
                        </span>
                      )}
                      <span className="text-[10px] text-white/25 ml-auto shrink-0">
                        {relativeTime(ev.createdAt)}
                      </span>
                    </div>

                    {/* Expanded: description + metadata */}
                    {expanded === ev.id && (
                      <div className="mt-2 space-y-1.5">
                        {ev.description && ev.description !== ev.title && (
                          <p className="text-[11px] text-white/50 break-words">{ev.description}</p>
                        )}
                        {ev.metadata && (
                          <pre className="text-[10px] font-mono text-green-400/70 bg-white/5 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                            {metadataString(ev.metadata)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expand chevron */}
                  <span className="text-[10px] text-white/20 shrink-0 mt-0.5">
                    {expanded === ev.id ? '▲' : '▼'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 px-3 h-9 rounded-full shadow-lg text-xs font-medium transition-all duration-200',
          'border border-border/60',
          open
            ? 'bg-surface text-foreground'
            : 'bg-black/90 text-white/70 hover:text-white',
        )}
        title="Toggle operation logs"
      >
        {/* Activity dot */}
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0 transition-colors',
            hasNew ? 'bg-green-400 animate-pulse' : 'bg-white/20',
          )}
        />
        <span>Ops Log</span>
        {events.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-mono">
            {events.length}
          </span>
        )}
      </button>
    </div>
  );
}

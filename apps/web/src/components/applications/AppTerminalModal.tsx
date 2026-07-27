'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { WsEvents } from '@hamyar-ops/shared';
import type { AppTerminalInfoDto } from '@hamyar-ops/shared';

export function AppTerminalModal({ pm2Name, onClose }: { pm2Name: string; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [error, setError] = useState('');

  const { data: info, isLoading } = useQuery({
    queryKey: ['app-terminal-info', pm2Name],
    queryFn: () => apiClient.get(`/applications/${pm2Name}/terminal`).then((r) => r.data as AppTerminalInfoDto),
  });

  useEffect(() => {
    if (!containerRef.current || !accessToken || !info) return;
    if (info.kind === 'unknown') { setError('Cannot detect app runtime (no PM2 process or container).'); return; }
    if (info.kind === 'docker' && !info.containerId) { setError('Container not found.'); return; }

    const term = new Terminal({
      theme: { background: '#000', foreground: '#f0f0f0', cursor: '#6366f1', cursorAccent: '#000' },
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term; fitRef.current = fit;

    const target = info.kind === 'docker'
      ? { kind: 'docker', containerId: info.containerId, command: info.command || '/bin/sh', deployPath: null }
      : { kind: 'pm2', deployPath: info.deployPath, containerId: null, command: null };

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3005';
    const socket = io(`${wsUrl}/terminal`, { auth: { token: accessToken }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      const { cols, rows } = term;
      socket.emit(WsEvents.TERMINAL_CREATE, { cols, rows, target }, (res: { sessionId: string }) => {
        sessionIdRef.current = res?.sessionId;
      });
    });
    socket.on(WsEvents.TERMINAL_OUTPUT, (d: { sessionId: string; data: string }) => {
      if (d.sessionId === sessionIdRef.current) term.write(d.data);
    });
    socket.on(WsEvents.TERMINAL_CLOSED, () => term.write('\r\n\x1b[31m[closed]\x1b[0m\r\n'));
    term.onData((data) => {
      if (sessionIdRef.current) socket.emit(WsEvents.TERMINAL_INPUT, { sessionId: sessionIdRef.current, data });
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      if (sessionIdRef.current) socket.emit(WsEvents.TERMINAL_RESIZE, { sessionId: sessionIdRef.current, cols: term.cols, rows: term.rows });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (sessionIdRef.current) socket.emit(WsEvents.TERMINAL_CLOSE, { sessionId: sessionIdRef.current });
      socket.disconnect();
      term.dispose();
    };
  }, [accessToken, info]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl w-full max-w-4xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Terminal — {pm2Name}</h2>
            <p className="text-xs text-muted-foreground font-mono">
              {info ? `${info.kind === 'docker' ? `docker exec ${info.containerName ?? info.containerId}` : `shell in ${info.deployPath ?? '~'}`}` : 'loading…'}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
        </div>
        <div className="flex-1 bg-black p-2 overflow-hidden min-h-64">
          {error ? <div className="text-error text-sm p-4">{error}</div> : (
            <div ref={containerRef} className="w-full h-full" />
          )}
        </div>
      </div>
    </div>
  );
}
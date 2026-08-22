'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { WsEvents } from '@hamyar-ops/shared';

export default function TerminalClient({
  target,
}: {
  target?: { kind: 'pm2' | 'docker' | 'shell'; deployPath?: string | null; containerId?: string | null; command?: string | null };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!containerRef.current || !accessToken) return;

    const term = new Terminal({
      theme: {
        background: '#000000',
        foreground: '#f0f0f0',
        cursor: '#6366f1',
        cursorAccent: '#000000',
      },
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3005';
    const socket = io(`${wsUrl}/terminal`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const { cols, rows } = term;
      socket.emit(WsEvents.TERMINAL_CREATE, { cols, rows, target }, (res: { sessionId: string }) => {
        sessionIdRef.current = res?.sessionId;
      });
    });

    socket.on(WsEvents.TERMINAL_OUTPUT, (data: { sessionId: string; data: string }) => {
      if (data.sessionId === sessionIdRef.current) term.write(data.data);
    });

    socket.on(WsEvents.TERMINAL_CLOSED, () => {
      term.write('\r\n\x1b[31mConnection closed\x1b[0m\r\n');
    });

    term.onData((data) => {
      if (sessionIdRef.current) {
        socket.emit(WsEvents.TERMINAL_INPUT, { sessionId: sessionIdRef.current, data });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (sessionIdRef.current) {
        socket.emit(WsEvents.TERMINAL_RESIZE, {
          sessionId: sessionIdRef.current,
          cols: term.cols,
          rows: term.rows,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (sessionIdRef.current) {
        socket.emit(WsEvents.TERMINAL_CLOSE, { sessionId: sessionIdRef.current });
      }
      socket.disconnect();
      term.dispose();
    };
  }, [accessToken, target]);

  return <div ref={containerRef} className="w-full h-full" />;
}

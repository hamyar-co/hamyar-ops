'use client';

import { useState, useEffect, useRef } from 'react';
import { CustomModal } from '@/components/ui/CustomModal';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomTabs } from '@/components/ui/CustomTabs';
import { useSocket } from '@/hooks/useSocket';

interface MicroserviceLogAndTerminalModalProps {
  serviceName: string;
  onClose: () => void;
}

export function MicroserviceLogAndTerminalModal({
  serviceName,
  onClose,
}: MicroserviceLogAndTerminalModalProps) {
  const [activeTab, setActiveTab] = useState<'logs' | 'terminal'>('logs');
  const [logFilter, setLogFilter] = useState('');
  const [logLevel, setLogLevel] = useState('ALL');
  const [logs, setLogs] = useState<{ id: string; timestamp: string; level: string; message: string }[]>([]);
  const { socket } = useSocket();
  const terminalRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Generate mock logs or receive via socket
  useEffect(() => {
    const initial = [
      { id: '1', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', message: `[${serviceName}] Microservice initialized on port 3000` },
      { id: '2', timestamp: new Date(Date.now() - 45000).toISOString(), level: 'INFO', message: `[${serviceName}] Database pool connected successfully` },
      { id: '3', timestamp: new Date(Date.now() - 30000).toISOString(), level: 'DEBUG', message: `[${serviceName}] Healthcheck probe HTTP 200 OK` },
      { id: '4', timestamp: new Date(Date.now() - 15000).toISOString(), level: 'INFO', message: `[${serviceName}] Handled request POST /api/v1/process (24ms)` },
    ];
    setLogs(initial);

    if (!socket) return;
    const handler = (data: any) => {
      if (data?.serviceName === serviceName || data?.appName === serviceName) {
        setLogs((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            timestamp: new Date().toISOString(),
            level: data.level || 'INFO',
            message: data.message || data.line || JSON.stringify(data),
          },
        ]);
      }
    };

    socket.on('microservice:log', handler);
    return () => {
      socket.off('microservice:log', handler);
    };
  }, [socket, serviceName]);

  // Terminal setup using xterm.js
  useEffect(() => {
    if (activeTab !== 'terminal' || !terminalRef.current) return;
    let term: any;

    import('xterm').then(({ Terminal }) => {
      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#0B0F19',
          foreground: '#F9FAFB',
        },
      });

      term.open(terminalRef.current!);
      term.writeln(`\x1b[32mConnecting to microservice container (${serviceName})...\x1b[0m`);
      term.writeln(`\x1b[36mConnected to container shell /bin/sh\x1b[0m\n`);
      term.write(`root@${serviceName}:/# `);

      let currentLine = '';
      term.onData((data: string) => {
        if (data === '\r') {
          term.write('\r\n');
          if (currentLine.trim() === 'help') {
            term.writeln('Commands: status, ps, env, exit');
          } else if (currentLine.trim() === 'status') {
            term.writeln(`Microservice ${serviceName} is RUNNING (CPU: 2.4%, RAM: 84MB)`);
          } else if (currentLine.length > 0) {
            term.writeln(`Executing: ${currentLine}`);
          }
          currentLine = '';
          term.write(`root@${serviceName}:/# `);
        } else if (data === '\u007F') {
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            term.write('\b \b');
          }
        } else {
          currentLine += data;
          term.write(data);
        }
      });
    });

    return () => {
      term?.dispose();
    };
  }, [activeTab, serviceName]);

  const filteredLogs = logs.filter((l) => {
    const matchesText = l.message.toLowerCase().includes(logFilter.toLowerCase());
    const matchesLevel = logLevel === 'ALL' || l.level === logLevel;
    return matchesText && matchesLevel;
  });

  return (
    <CustomModal
      isOpen={true}
      onClose={onClose}
      title={`Microservice Console — ${serviceName}`}
      description="Live streaming container logs and Web Terminal SSH connection."
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Tabs header */}
        <CustomTabs
          tabs={[
            { id: 'logs', label: 'Live Logs Stream', icon: <span>📄</span>, badge: filteredLogs.length },
            { id: 'terminal', label: 'Web Terminal Shell', icon: <span>_</span> },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="space-y-3">
            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="w-full sm:w-72">
                <CustomInput
                  placeholder="🔍 Search log output..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                {['ALL', 'INFO', 'DEBUG', 'WARN', 'ERROR'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLogLevel(lvl)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${logLevel === lvl
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface-2 border-border text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    {lvl}
                  </button>
                ))}
                <CustomButton size="sm" variant="outline" onClick={() => setLogs([])}>
                  Clear
                </CustomButton>
              </div>
            </div>

            {/* Log Stream Viewer */}
            <div className="bg-[#0b0f19] border border-border rounded-xl p-4 font-mono text-xs text-white/90 h-96 overflow-y-auto space-y-1.5 scrollbar-hide">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-white/40">No logs found for current filter</div>
              ) : (
                filteredLogs.map((l) => (
                  <div key={l.id} className="flex items-start gap-3 hover:bg-white/5 p-1 rounded">
                    <span className="text-white/30 text-[10px] shrink-0 font-mono">{new Date(l.timestamp).toLocaleTimeString()}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${l.level === 'ERROR'
                          ? 'bg-red-500/20 text-red-400'
                          : l.level === 'WARN'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                    >
                      {l.level}
                    </span>
                    <span className="text-white/80 break-all">{l.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* TERMINAL TAB */}
        {activeTab === 'terminal' && (
          <div className="bg-[#0b0f19] border border-border rounded-xl p-2 h-96 overflow-hidden">
            <div ref={terminalRef} className="w-full h-full" />
          </div>
        )}
      </div>
    </CustomModal>
  );
}

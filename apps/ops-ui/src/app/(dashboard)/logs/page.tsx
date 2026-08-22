'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient, authDownloadUrl } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { WsEvents } from '@hamyar-ops/shared';
import { DateTimePicker } from '@/components/shared/DateTimePicker';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomSwitch } from '@/components/ui/CustomSwitch';

interface LogSource {
  value: string;
  label: string;
  group: string;
}

type TimePreset = 'live' | '1h' | '12h' | '24h' | 'today' | '7d' | 'custom';

export default function LogsPage() {
  const searchParams = useSearchParams();
  const [source, setSource] = useState(
    searchParams.get('source') === 'pm2' ? `pm2-${searchParams.get('name')}`
    : searchParams.get('source') === 'docker' ? `docker-${searchParams.get('id')}`
    : '',
  );
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<TimePreset>('live');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [lineCount, setLineCount] = useState('500');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [level, setLevel] = useState<'out' | 'err'>('out');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();
  const [live, setLive] = useState(false);

  const { data: sources = [] } = useQuery({
    queryKey: ['log-sources'],
    queryFn: () => apiClient.get('/logs/sources').then((r) => r.data as LogSource[]),
  });

  const { data: containers } = useQuery({
    queryKey: ['docker-containers'],
    queryFn: () => apiClient.get('/docker/containers').then((r) => r.data as any[]),
    enabled: source.startsWith('docker-'),
  });

  useEffect(() => {
    if (!source && sources.length > 0) {
      const firstPm2 = sources.find((s) => s.value.startsWith('pm2-'));
      setSource(firstPm2?.value ?? sources[0].value);
    }
  }, [sources, source]);

  const sourceOptions = sources.map((s) => ({
    value: s.value,
    label: `[${s.group}] ${s.label}`,
  }));

  const timeOptions = [
    { value: 'live', label: 'Live (No Range)' },
    { value: '1h', label: 'Last 1 Hour' },
    { value: '12h', label: 'Last 12 Hours' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 Days' },
    { value: 'custom', label: 'Custom Range' },
  ];

  const lineCountOptions = [
    { value: '200', label: '200 lines' },
    { value: '500', label: '500 lines' },
    { value: '1000', label: '1,000 lines' },
    { value: '2000', label: '2,000 lines' },
    { value: '5000', label: '5,000 lines' },
  ];

  const fetchLogs = async () => {
    setLoading(true);
    setLines([]);
    try {
      let url = '';
      const qs = `lines=${lineCount}`;
      if (source.startsWith('pm2-')) {
        const pm2Name = source.replace('pm2-', '');
        url = `/logs/pm2/${pm2Name}?${qs}&type=${level}`;
      } else if (source.startsWith('docker-')) {
        const containerId = source.replace('docker-', '');
        url = `/logs/docker/${containerId}?${qs}`;
      } else if (source) {
        url = `/logs/file/${source}?${qs}`;
      }
      if (url) {
        const res = await apiClient.get(url);
        setLines(res.data as string[]);
      }
    } catch {
      setLines(['Error loading logs or source unavailable']);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (source && !live) fetchLogs();
  }, [source, lineCount, level]);

  const filteredLines = lines.filter((l) => {
    const matchesSearch = l.toLowerCase().includes(search.toLowerCase());
    const matchesErr = !onlyErrors || /error|err|fail|exception|fatal/i.test(l);
    return matchesSearch && matchesErr;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Log Streamer</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Stream system logs, container output, and PM2 stdout/stderr in real-time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton size="sm" variant="outline" onClick={fetchLogs} loading={loading} icon={<span>🔄</span>}>
            Refresh
          </CustomButton>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CustomSelect
            label="Log Source"
            value={source}
            onChange={setSource}
            options={sourceOptions}
          />
          <CustomSelect
            label="Time Range"
            value={preset}
            onChange={(v) => setPreset(v as TimePreset)}
            options={timeOptions}
          />
          <CustomSelect
            label="Max Lines"
            value={lineCount}
            onChange={setLineCount}
            options={lineCountOptions}
          />
          <CustomInput
            label="Search Filter"
            placeholder="Filter text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-4">
            <CustomSwitch
              checked={onlyErrors}
              onChange={setOnlyErrors}
              label="Errors Only"
            />
          </div>
          <CustomBadge variant="info">{filteredLines.length} lines</CustomBadge>
        </div>
      </div>

      {/* Log Output Console */}
      <div className="bg-surface border border-border rounded-xl p-4 font-mono text-xs text-foreground/90 h-[520px] overflow-y-auto space-y-1 scrollbar-hide">
        {loading ? (
          <div className="p-8 text-center text-foreground/40">Loading log output...</div>
        ) : filteredLines.length === 0 ? (
          <div className="p-8 text-center text-foreground/40">No logs found for current source/filter</div>
        ) : (
          filteredLines.map((l, i) => (
            <div key={i} className="hover:bg-surface-2 px-2 py-0.5 rounded whitespace-pre-wrap break-all">
              {l}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
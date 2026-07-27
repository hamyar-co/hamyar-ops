import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  online: { label: 'online', color: 'bg-success/15 text-success border-success/20' },
  running: { label: 'running', color: 'bg-success/15 text-success border-success/20' },
  stopped: { label: 'stopped', color: 'bg-muted/50 text-muted-foreground border-border' },
  exited: { label: 'exited', color: 'bg-muted/50 text-muted-foreground border-border' },
  errored: { label: 'error', color: 'bg-error/15 text-error border-error/20' },
  error: { label: 'error', color: 'bg-error/15 text-error border-error/20' },
  dead: { label: 'dead', color: 'bg-error/15 text-error border-error/20' },
  launching: { label: 'launching', color: 'bg-warning/15 text-warning border-warning/20' },
  starting: { label: 'starting', color: 'bg-warning/15 text-warning border-warning/20' },
  restarting: { label: 'restarting', color: 'bg-info/15 text-info border-info/20' },
  paused: { label: 'paused', color: 'bg-warning/15 text-warning border-warning/20' },
  created: { label: 'created', color: 'bg-info/15 text-info border-info/20' },
} as const;

type Status = keyof typeof STATUS_CONFIG | string;

export function StatusBadge({ status }: { status: Status }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
    label: status,
    color: 'bg-muted/50 text-muted-foreground border-border',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        config.color,
      )}
    >
      {config.label}
    </span>
  );
}

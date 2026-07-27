'use client';

import { cn } from '@/lib/utils';

const COLOR_MAP = {
  info: { bg: 'bg-info/10', text: 'text-info', bar: 'bg-info' },
  warning: { bg: 'bg-warning/10', text: 'text-warning', bar: 'bg-warning' },
  success: { bg: 'bg-success/10', text: 'text-success', bar: 'bg-success' },
  accent: { bg: 'bg-accent/10', text: 'text-accent', bar: 'bg-accent' },
  error: { bg: 'bg-error/10', text: 'text-error', bar: 'bg-error' },
} as const;

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  color: keyof typeof COLOR_MAP;
  percent: number | null;
}

export function MetricCard({ title, value, subtitle, color, percent }: Props) {
  const c = COLOR_MAP[color];
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
          <p className={cn('text-2xl font-bold mt-1', c.text)}>{value}</p>
        </div>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', c.bg)}>
          <span className={cn('text-lg', c.text)}>
            {color === 'info' ? '⚡' : color === 'warning' ? '🧠' : color === 'success' ? '💾' : '📡'}
          </span>
        </div>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      {percent !== null && (
        <div className="mt-3">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', c.bar)}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { cn } from '@/lib/utils';

interface ResponsiveTableProps {
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveTable({ children, className }: ResponsiveTableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-surface">
      <table className={cn('w-full text-sm', className)}>
        {children}
      </table>
    </div>
  );
}

interface ScrollableWidgetProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollableWidget({ children, className }: ScrollableWidgetProps) {
  return (
    <div className={cn(
      'bg-surface border border-border rounded-xl overflow-hidden',
      'max-h-[calc(100vh-16rem)] overflow-y-auto',
      className
    )}>
      {children}
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div className={cn(
      'bg-surface border border-border rounded-xl',
      padding ? 'p-4 md:p-5' : '',
      className
    )}>
      {children}
    </div>
  );
}

interface GridProps {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}

export function Grid({ children, cols = 1, className }: GridProps) {
  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', colsClass[cols], className)}>
      {children}
    </div>
  );
}
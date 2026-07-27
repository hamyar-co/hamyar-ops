'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CustomBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}

export function CustomBadge({
  children,
  variant = 'default',
  size = 'md',
  className,
}: CustomBadgeProps) {
  const variants = {
    default: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-green-500/10 text-green-500 border-green-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    error: 'bg-red-500/10 text-red-500 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    outline: 'bg-transparent text-foreground border-border',
  };

  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5 rounded',
    md: 'text-xs px-2 py-0.5 rounded-md font-medium',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

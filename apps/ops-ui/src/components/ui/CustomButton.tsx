'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface CustomButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const CustomButton = React.forwardRef<HTMLButtonElement, CustomButtonProps>(
  ({ children, variant = 'primary', size = 'md', loading = false, icon, className, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
      secondary: 'bg-surface-2 text-foreground hover:bg-border/60 border border-border',
      outline: 'bg-transparent border border-border text-foreground hover:bg-surface-2',
      danger: 'bg-error text-foreground hover:bg-error/90 shadow-sm',
      ghost: 'bg-transparent text-foreground hover:bg-surface-2',
    };

    const sizes = {
      sm: 'h-8 px-2.5 text-xs rounded-md',
      md: 'h-9 px-3.5 text-sm rounded-lg font-medium',
      lg: 'h-11 px-5 text-base rounded-lg font-semibold',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 transition-all duration-150 outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children}
      </button>
    );
  },
);

CustomButton.displayName = 'CustomButton';

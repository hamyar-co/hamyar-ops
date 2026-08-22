'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const CustomInput = React.forwardRef<HTMLInputElement, CustomInputProps>(
  ({ label, error, helperText, icon, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full text-left">
        {label && <label className="text-xs font-semibold text-foreground/80">{label}</label>}
        <div className="relative flex items-center">
          {icon && <div className="absolute left-3 text-muted-foreground">{icon}</div>}
          <input
            ref={ref}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-lg border transition-all duration-150 outline-none',
              'bg-surface border-border text-foreground placeholder:text-muted-foreground/60',
              'focus:border-primary focus:ring-2 focus:ring-primary/20',
              icon && 'pl-9',
              error && 'border-error ring-2 ring-error/20',
              className,
            )}
            {...props}
          />
        </div>
        {error && <span className="text-[11px] text-error font-medium">{error}</span>}
        {helperText && !error && <span className="text-[11px] text-muted-foreground">{helperText}</span>}
      </div>
    );
  },
);

CustomInput.displayName = 'CustomInput';

'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CustomSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: CustomSwitchProps) {
  return (
    <label
      className={cn(
        'flex items-center justify-between gap-3 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="text-xs font-semibold text-foreground">{label}</span>}
          {description && <span className="text-[11px] text-muted-foreground">{description}</span>}
        </div>
      )}
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <div
          className={cn(
            'w-4 h-4 rounded-full bg-foreground shadow-md transform transition-transform duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </div>
    </label>
  );
}

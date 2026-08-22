'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  label,
  disabled = false,
  className,
  searchable = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('flex flex-col gap-1.5 text-left', className)} ref={containerRef}>
      {label && <label className="text-xs font-semibold text-foreground/80">{label}</label>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border transition-all duration-150 outline-none',
            'bg-surface border-border hover:border-primary/50 text-foreground',
            isOpen && 'border-primary ring-2 ring-primary/20',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
            <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>
          <svg
            className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0', isOpen && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-surface border border-border rounded-lg shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto animate-in fade-in-50 zoom-in-95">
            {searchable && (
              <div className="px-2 py-1.5 border-b border-border">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs rounded bg-surface-2 text-foreground border border-border focus:outline-none focus:border-primary"
                />
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">No options found</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors',
                    opt.value === value
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-surface-2',
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    {opt.icon}
                    <div className="truncate">
                      <div>{opt.label}</div>
                      {opt.description && (
                        <div className="text-[10px] text-muted-foreground truncate">{opt.description}</div>
                      )}
                    </div>
                  </div>
                  {opt.value === value && <span className="text-primary font-bold">✓</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

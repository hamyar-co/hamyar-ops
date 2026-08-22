'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;           // ISO string
  onChange: (iso: string) => void;
  label?: string;
  clearable?: boolean;
  className?: string;
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DateTimePicker({ value, onChange, label, clearable, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const date = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(date.getFullYear());
  const [viewMonth, setViewMonth] = useState(date.getMonth());
  const [hour, setHour] = useState(date.getHours());
  const [minute, setMinute] = useState(date.getMinutes());

  useEffect(() => {
    if (!value) return;
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
    setHour(date.getHours());
    setMinute(date.getMinutes());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const display = value ? new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '—';

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedDay = value ? new Date(value) : null;
  const isSel = (d: number) =>
    selectedDay &&
    selectedDay.getFullYear() === viewYear &&
    selectedDay.getMonth() === viewMonth &&
    selectedDay.getDate() === d;

  const pick = (d: number) => {
    const dt = new Date(viewYear, viewMonth, d, hour, minute);
    onChange(dt.toISOString());
  };

  const applyTime = () => {
    if (!value) {
      const now = new Date();
      now.setHours(hour, minute, 0, 0);
      onChange(now.toISOString());
      return;
    }
    const dt = new Date(value);
    dt.setHours(hour, minute, 0, 0);
    onChange(dt.toISOString());
  };

  const moveMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y);
  };

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      {label && <label className="block text-xs text-muted-foreground mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-foreground hover:border-primary/50 transition-colors"
      >
        <span className={value ? '' : 'text-muted-foreground'}>{display}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
          <path d="M7 2v2M17 2v2M3 6h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-surface border border-border rounded-xl shadow-xl p-3 space-y-3">
          {/* Calendar header */}
          <div className="flex items-center justify-between">
            <button onClick={() => moveMonth(-1)} className="text-muted-foreground hover:text-foreground px-1.5">‹</button>
            <span className="text-sm font-medium text-foreground">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={() => moveMonth(1)} className="text-muted-foreground hover:text-foreground px-1.5">›</button>
          </div>
          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {DOW.map((d) => <div key={d} className="text-[10px] text-muted-foreground py-1">{d}</div>)}
            {cells.map((d, i) => (
              d === null
                ? <div key={i} />
                : <button
                    key={i}
                    onClick={() => pick(d)}
                    className={`text-xs py-1.5 rounded transition-colors ${
                      isSel(d)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-surface-2'
                    }`}
                  >{d}</button>
            ))}
          </div>
          {/* Time */}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">Time</span>
            <div className="flex items-center gap-1">
              <input
                type="number" min={0} max={23} value={String(hour).padStart(2, '0')}
                onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                className="w-10 px-1.5 py-1 bg-surface-2 border border-border rounded text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-muted-foreground">:</span>
              <input
                type="number" min={0} max={59} value={String(minute).padStart(2, '0')}
                onChange={(e) => setMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="w-10 px-1.5 py-1 bg-surface-2 border border-border rounded text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={applyTime} className="ml-1 px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20">Set</button>
            </div>
          </div>
          {/* Quick + raw */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => { const n = new Date(); n.setMinutes(n.getMinutes() - 60); onChange(n.toISOString()); }} className="text-xs px-2 py-1 rounded bg-surface-2 border border-border text-muted-foreground hover:text-foreground">−1h</button>
            <button onClick={() => { const n = new Date(); n.setHours(0, 0, 0, 0); onChange(n.toISOString()); }} className="text-xs px-2 py-1 rounded bg-surface-2 border border-border text-muted-foreground hover:text-foreground">Start of day</button>
            <button onClick={() => onChange(new Date().toISOString())} className="text-xs px-2 py-1 rounded bg-surface-2 border border-border text-muted-foreground hover:text-foreground">Now</button>
            {clearable && (
              <button onClick={() => { onChange(''); }} className="text-xs px-2 py-1 rounded bg-surface-2 border border-border text-muted-foreground hover:text-foreground ml-auto">Clear</button>
            )}
          </div>
          {/* Raw HTML fallback for typing */}
          <details className="pt-1">
            <summary className="text-[11px] text-muted-foreground cursor-pointer">Type manually</summary>
            <input
              type="datetime-local"
              value={toLocalInput(value)}
              onChange={(e) => { const iso = fromLocalInput(e.target.value); if (iso) onChange(iso); }}
              className="mt-1 w-full px-2 py-1.5 bg-surface-2 border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </details>
        </div>
      )}
    </div>
  );
}
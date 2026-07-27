import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Response } from 'express';
import { PM2Service } from '../pm2/pm2.service';

const execFileAsync = promisify(execFile);

const LOG_ROOTS = {
  hamyar: process.env.LOG_PATH_HAMYAR || '/var/log/hamyar',
  nginx: process.env.LOG_PATH_NGINX || '/var/log/nginx',
  system: '/var/log',
};

const NGINX_LOG_FILES: Record<string, string> = {
  access: 'hamyar-api-access.log',
  error: 'hamyar-api-error.log',
  panel: 'hamyar-panel-error.log',
  storage: 'hamyar-storage-error.log',
  app: 'hamyar-app-access.log',
  api: 'hamyar-api-access.log',
  'nginx-api': 'hamyar-api-access.log',
  'nginx-error': 'hamyar-api-error.log',
};

const SYSTEM_UNITS = ['nginx', 'docker', 'postgresql', 'redis', 'ssh', 'cron', 'kernel'];

// Match a leading ISO-style timestamp at the start of a log line:
// 2024-07-09 12:34:56  | 2024-07-09T12:34:56 | 2024-07-09T12:34:56.123Z
const TS_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s?(.*)$/;

interface Range {
  since: number | null;
  until: number | null;
}

function toMs(v?: string): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function parseTs(line: string): number | null {
  const m = line.match(TS_RE);
  if (!m) return null;
  const t = Date.parse(m[1].replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
}

export interface LogSource {
  value: string;        // unique id used by the frontend <select>
  label: string;       // human label
  group: string;       // optgroup: "PM2" | "Nginx" | "System" | "Docker"
  pm2Name?: string;    // for live tail topic pm2:logs:<pm2Name>
  hasOut?: boolean;     // historical out file present?
  hasErr?: boolean;     // historical err file present?
}

@Injectable()
export class LogsService {
  constructor(private pm2: PM2Service) {}

  /**
   * Dynamically discover available log sources:
   *  - PM2 processes (real log paths from pm2_env)  → live tail + historical files
   *  - Nginx log files that exist on disk
   *  - systemd units available via journalctl
   * Historical reads come from /var/log/hamyar/* (or the real pm2 path);
   * live tail uses the pm2 message bus (pm2:logs:<name> WS topic).
   */
  async getSources(): Promise<LogSource[]> {
    const out: LogSource[] = [];

    // PM2 — read real log paths instead of guessing the filename.
    let procs: any[] = [];
    try { procs = await this.pm2.list(); } catch {}
    for (const p of procs) {
      const name = p.name;
      const outPath = p.logOutPath;
      const errPath = p.logErrPath;
      const hasOut = !!outPath && fs.existsSync(outPath);
      const hasErr = !!errPath && fs.existsSync(errPath);
      out.push({
        value: `pm2-${name}`,
        label: `PM2: ${name}`,
        group: 'PM2',
        pm2Name: name,
        hasOut,
        hasErr,
      });
    }

    // Nginx — only files that actually exist.
    for (const [key, file] of Object.entries(NGINX_LOG_FILES)) {
      // avoid duplicates ("api" overlaps "access")
      if (out.some((s) => s.value === `nginx-${key}`)) continue;
      const fp = path.join(LOG_ROOTS.nginx, file);
      if (fs.existsSync(fp)) {
        out.push({ value: `nginx-${key}`, label: `Nginx: ${key}`, group: 'Nginx' });
      }
    }

    // System (journalctl) — always expose the known-good units.
    for (const unit of SYSTEM_UNITS) {
      out.push({ value: `system-${unit}`, label: `System: ${unit}`, group: 'System (journalctl)' });
    }

    return out;
  }

  async getPM2Logs(processName: string, lines = 500, level?: string, since?: string, until?: string): Promise<string[]> {
    const filePath = await this.resolvePm2Path(processName, level);
    return this.readAndFilter(filePath, lines, { since: toMs(since), until: toMs(until) });
  }

  /**
   * Resolve the real on-disk log file for a pm2 process (out or err) using the
   * pm2 daemon's recorded path, falling back to the /var/log/hamyar convention.
   */
  private async resolvePm2Path(processName: string, level?: string): Promise<string> {
    let filePath = '';
    try {
      const proc = await this.pm2.describe(processName);
      filePath = level === 'error' ? (proc.logErrPath || '') : (proc.logOutPath || '');
    } catch {}
    if (filePath && fs.existsSync(filePath)) return filePath;
    // Fallback to the conventional /var/log/hamyar layout.
    const suffix = level === 'error' ? 'error' : 'out';
    const candidates = [
      path.join(LOG_ROOTS.hamyar, `${processName}-${suffix}.log`),
      path.join(LOG_ROOTS.hamyar, `${processName.replace(/^hamyar-/, '')}-${suffix}.log`),
    ];
    return candidates.find((c) => fs.existsSync(c)) || candidates[0];
  }

  async downloadPm2(processName: string, level: 'out' | 'error', res: Response): Promise<void> {
    const filePath = await this.resolvePm2Path(processName, level);
    if (!fs.existsSync(filePath)) {
      res.status(404).send('log file not found');
      return;
    }
    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    fs.createReadStream(filePath).pipe(res);
  }

  async getNginxLogs(type: string, lines = 500, since?: string, until?: string): Promise<string[]> {
    const filename = NGINX_LOG_FILES[type];
    if (!filename) throw new BadRequestException(`Unknown nginx log type: ${type}`);
    const filePath = path.join(LOG_ROOTS.nginx, filename);
    return this.readAndFilter(filePath, lines, { since: toMs(since), until: toMs(until) });
  }

  async getSystemLogs(unit: string, lines = 200, since?: string, until?: string): Promise<string[]> {
    if (!SYSTEM_UNITS.includes(unit)) throw new BadRequestException(`Unit ${unit} not allowed`);
    try {
      const args = ['-u', unit, '-n', String(lines), '--no-pager', '-o', 'short-iso'];
      if (since) args.push('--since', since);
      if (until) args.push('--until', until);
      const { stdout } = await execFileAsync('journalctl', args);
      return stdout.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  async searchLogs(filePath: string, query: string, lines = 100): Promise<string[]> {
    this.validatePath(filePath);
    try {
      const { stdout } = await execFileAsync('grep', ['-n', '--text', '-m', String(lines), query, filePath]);
      return stdout.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  streamDownload(filePath: string, res: Response): void {
    this.validatePath(filePath);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Log file not found');
    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    fs.createReadStream(filePath).pipe(res);
  }

  private async readAndFilter(filePath: string, lines: number, range: Range): Promise<string[]> {
    if (!fs.existsSync(filePath)) return [];

    const needFilter = range.since !== null || range.until !== null;
    // Pull a generous window so time filtering keeps enough context
    const tailCount = needFilter ? Math.max(lines * 6, 2000) : lines;

    try {
      const { stdout } = await execFileAsync('tail', ['-n', String(tailCount), filePath]);
      const all = stdout.split('\n');
      if (!needFilter) return all.filter(Boolean);

      // Attach timestamps: a line without a timestamp inherits the most recent
      // preceding timestamped line's time. nginx access/error logs don't carry
      // an ISO prefix, so for those we keep all lines (best-effort).
      const out: string[] = [];
      let lastTs: number | null = null;
      let anyTs = false;
      for (const raw of all) {
        if (!raw) continue;
        const ts = parseTs(raw);
        if (ts !== null) { anyTs = true; lastTs = ts; }
        if (lastTs === null) { out.push(raw); continue; }
        const afterSince = range.since === null || lastTs >= range.since;
        const beforeUntil = range.until === null || lastTs <= range.until;
        if (afterSince && beforeUntil) out.push(raw);
      }
      // If no line had a parseable timestamp, fall back to returning the tail.
      if (!anyTs) return all.filter(Boolean);
      return out.length > lines ? out.slice(-lines) : out;
    } catch {
      return [];
    }
  }

  private validatePath(filePath: string): void {
    const allowedRoots = Object.values(LOG_ROOTS);
    const resolved = path.resolve(filePath);
    const allowed = allowedRoots.some((root) => resolved.startsWith(path.resolve(root)));
    if (!allowed) throw new BadRequestException('Access denied: path outside allowed directories');
  }
}
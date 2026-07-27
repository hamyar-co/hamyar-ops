import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DockerService } from '../docker/docker.service';

const LOG_HAMYAR = process.env.LOG_PATH_HAMYAR || '/var/log/hamyar';
const LOG_NGINX = process.env.LOG_PATH_NGINX || '/var/log/nginx';
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

const NGINX_ERROR_FILES = ['hamyar-api-error.log', 'hamyar-panel-error.log', 'hamyar-storage-error.log'];

interface RawError {
  source: string;
  sourceName: string;
  message: string;
  fullLine: string;
  route: string | null;
  when: Date;
}

const ERROR_RE = /\b(ERROR|Error|ERR|FATAL|fatal|panic|ECONNREFUSED|unhandled|exception|UnhandledPromiseRejection|stack|TypeError|ReferenceError)\b/i;

function parseWhen(line: string): Date {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
  if (m) {
    const t = Date.parse(m[1].replace(' ', 'T'));
    if (!Number.isNaN(t)) return new Date(t);
  }
  return new Date();
}

function extractRoute(line: string): string | null {
  // HTTP method + path
  const m = line.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s?"']+)/);
  if (m) return `${m[1]} ${m[2]}`;
  // express/nest route: "at /path" or "path: /x"
  const m2 = line.match(/(?:path|route|url):\s*["']?(\/[^\s"']+)/i);
  return m2 ? m2[1] : null;
}

function normalizeTitle(line: string): string {
  return line
    .replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s*/, '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

@Injectable()
export class ErrorLogsService implements OnModuleInit {
  private readonly logger = new Logger(ErrorLogsService.name);

  constructor(
    private prisma: PrismaService,
    private docker: DockerService,
    @InjectQueue('error-logs') private queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add('scan', {}, {
      repeat: { every: 60000 },
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  async scanNow(): Promise<{ scanned: number; inserted: number }> {
    const raws = await this.collectRawErrors();
    let inserted = 0;
    for (const e of raws) {
      const message = normalizeTitle(e.fullLine);
      const fingerprint = createHash('sha1').update(`${e.source}|${e.sourceName}|${message}`).digest('hex');
      const exists = await this.prisma.errorLog.findFirst({
        where: { fingerprint, timestamp: { gte: new Date(e.when.getTime() - DEDUP_WINDOW_MS) } },
        select: { id: true },
      });
      if (exists) continue;
      await this.prisma.errorLog.create({
        data: {
          source: e.source,
          sourceName: e.sourceName,
          message,
          fullLine: e.fullLine.slice(0, 4000),
          route: e.route,
          timestamp: e.when,
          fingerprint,
        },
      });
      inserted++;
    }
    return { scanned: raws.length, inserted };
  }

  private async collectRawErrors(): Promise<RawError[]> {
    const out: RawError[] = [];
    const apps = await this.prisma.appConfig.findMany({ select: { pm2Name: true } });

    // PM2 error + out logs
    for (const app of apps) {
      for (const suffix of ['error', 'out']) {
        const file = path.join(LOG_HAMYAR, `${app.pm2Name}-${suffix}.log`);
        out.push(...this.scanFileErrors(file, 'pm2', app.pm2Name));
      }
    }

    // Nginx error logs
    for (const f of NGINX_ERROR_FILES) {
      const file = path.join(LOG_NGINX, f);
      out.push(...this.scanFileErrors(file, 'nginx', f));
    }

    // Docker container logs (treat as docker source)
    try {
      const containers = await this.docker.listContainers();
      for (const c of containers) {
        if (c.state !== 'running') continue;
        let logs: string[];
        try { logs = await this.docker.getContainerLogs(c.id, 300); } catch { continue; }
        for (const line of logs) {
          if (!line || !ERROR_RE.test(line)) continue;
          out.push({
            source: 'docker',
            sourceName: c.name,
            message: normalizeTitle(line),
            fullLine: line,
            route: extractRoute(line),
            when: parseWhen(line),
          });
        }
      }
    } catch {}

    return out;
  }

  private scanFileErrors(file: string, source: string, sourceName: string): RawError[] {
    if (!fs.existsSync(file)) return [];
    try {
      const content = fs.readFileSync(file, 'utf8').split('\n').slice(-600);
      const res: RawError[] = [];
      for (const line of content) {
        if (!line || !ERROR_RE.test(line)) continue;
        res.push({
          source,
          sourceName,
          message: '',
          fullLine: line,
          route: extractRoute(line),
          when: parseWhen(line),
        });
      }
      return res;
    } catch {
      return [];
    }
  }

  // ── Query / aggregation ──

  async getOverview(opts: {
    bucket: '1h' | '12h' | '24h' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    source?: string;
    sourceName?: string;
  }) {
    const now = Date.now();
    const cfg = this.bucketConfig(opts.bucket);
    const from = new Date(now - cfg.spanMs);
    const where: any = { timestamp: { gte: from } };
    if (opts.source) where.source = opts.source;
    if (opts.sourceName) where.sourceName = opts.sourceName;

    const rows = await this.prisma.errorLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 5000,
    });

    const buckets = this.buildBounds(cfg, now);

    const totals = new Array(buckets.length).fill(0);
    const bySource: Record<string, number[]> = {};
    const fpMap: Record<string, any> = {};

    for (const r of rows) {
      const t = r.timestamp.getTime();
      const idx = buckets.findIndex((b) => t >= b.from && t < b.to);
      if (idx === -1) continue;
      totals[idx]++;
      bySource[r.sourceName] ??= new Array(buckets.length).fill(0);
      bySource[r.sourceName][idx] = (bySource[r.sourceName][idx] ?? 0) + 1;

      fpMap[r.fingerprint] ??= {
        fingerprint: r.fingerprint,
        title: r.message,
        source: r.source,
        sourceName: r.sourceName,
        route: r.route,
        count: 0,
        firstAt: r.timestamp,
        lastAt: r.timestamp,
      };
      const f = fpMap[r.fingerprint];
      f.count++;
      if (r.timestamp < f.firstAt) f.firstAt = r.timestamp;
      if (r.timestamp > f.lastAt) f.lastAt = r.timestamp;
    }

    const fingerprints = Object.values(fpMap).sort((a, b) => b.count - a.count);

    return {
      bucket: opts.bucket,
      from: from.toISOString(),
      to: new Date(now).toISOString(),
      labels: buckets.map((b) => b.label),
      totals,
      bySource,
      fingerprints,
      recent: rows.slice(0, 200),
    };
  }

  private bucketConfig(bucket: string) {
    switch (bucket) {
      case '1h': return { spanMs: 3600_000, count: 12, eachMs: 5 * 60_000, mode: 'fixed' as const };
      case '12h': return { spanMs: 12 * 3600_000, count: 12, eachMs: 3600_000, mode: 'fixed' as const };
      case '24h': return { spanMs: 24 * 3600_000, count: 24, eachMs: 3600_000, mode: 'fixed' as const };
      case 'daily': return { spanMs: 30 * 86400_000, count: 30, eachMs: 86400_000, mode: 'fixed' as const };
      case 'weekly': return { spanMs: 12 * 7 * 86400_000, count: 12, eachMs: 7 * 86400_000, mode: 'fixed' as const };
      case 'monthly': return { spanMs: 365 * 86400_000, count: 12, eachMs: 0, mode: 'month' as const };
      case 'yearly': return { spanMs: 5 * 365 * 86400_000, count: 5, eachMs: 0, mode: 'year' as const };
      default: return { spanMs: 24 * 3600_000, count: 24, eachMs: 3600_000, mode: 'fixed' as const };
    }
  }

  private buildBounds(cfg: ReturnType<typeof this.bucketConfig>, now: number) {
    const bounds: { from: number; to: number; label: string }[] = [];
    if (cfg.mode === 'fixed') {
      for (let i = cfg.count - 1; i >= 0; i--) {
        const to = now - i * cfg.eachMs;
        const from = to - cfg.eachMs;
        const stepDays = cfg.eachMs / 86400_000;
        const label = stepDays >= 1
          ? new Date(from).toLocaleString(undefined, { month: 'short', day: '2-digit' })
          : new Date(from).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit' });
        bounds.push({ from, to, label });
      }
    } else if (cfg.mode === 'month') {
      const start = new Date(now);
      start.setMonth(start.getMonth() - cfg.count - 1);
      start.setDate(1); start.setHours(0, 0, 0, 0);
      for (let i = 0; i < cfg.count; i++) {
        const fromD = new Date(start); start.setMonth(start.getMonth() + 1);
        const toD = new Date(start);
        bounds.push({ from: fromD.getTime(), to: toD.getTime(), label: fromD.toLocaleString(undefined, { month: 'short', year: '2-digit' }) });
      }
    } else {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - cfg.count);
      start.setMonth(0, 1); start.setHours(0, 0, 0, 0);
      for (let i = 0; i < cfg.count; i++) {
        const fromD = new Date(start); start.setFullYear(start.getFullYear() + 1);
        const toD = new Date(start);
        bounds.push({ from: fromD.getTime(), to: toD.getTime(), label: String(fromD.getFullYear()) });
      }
    }
    return bounds;
  }
}
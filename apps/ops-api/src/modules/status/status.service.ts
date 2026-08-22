import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type {
  SystemStatusDto,
  SystemAppStatusDto,
  AppIncidentDto,
  StatusTimelineDto,
  StatusOverviewDto,
  StatusTimelineBucketDto,
  AppHealthDto,
} from '@hamyar-ops/shared';

@Injectable()
export class StatusService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getSystemStatus(): Promise<SystemStatusDto> {
    const apps = await this.prisma.appConfig.findMany({ orderBy: { name: 'asc' } });

    const appStatuses: SystemAppStatusDto[] = [];
    let operational = 0;
    let degraded = 0;
    let down = 0;

    for (const app of apps) {
      const healthRaw = await this.redis.get(`app:health:${app.pm2Name}`);
      const health: AppHealthDto | null = healthRaw ? JSON.parse(healthRaw) : null;

      const activeIncident = await this.prisma.appIncident.findFirst({
        where: { appName: app.pm2Name, resolvedAt: null },
        orderBy: { startedAt: 'desc' },
        include: { events: { orderBy: { recordedAt: 'desc' }, take: 10 } },
      });

      const status = activeIncident?.status ?? (health?.healthy !== false ? 'UP' : 'DOWN') as any;

      if (status === 'UP') operational++;
      else if (status === 'DEGRADED') degraded++;
      else down++;

      appStatuses.push({
        appName: app.pm2Name,
        name: app.name,
        status: status as any,
        health,
        activeIncident: activeIncident ? this.toIncidentDto(activeIncident) : null,
        uptimePercent: health?.uptimePercent ?? 100,
        responseTimeMs: health?.responseTimeMs ?? null,
      });
    }

    let overall: SystemStatusDto['overall'] = 'operational';
    if (down > 0) overall = 'major_outage';
    else if (degraded > 0) overall = 'degraded';

    return {
      overall,
      summary: { total: apps.length, operational, degraded, down },
      apps: appStatuses,
      lastUpdated: new Date().toISOString(),
    };
  }

  async getStatusHistory(period = '24h'): Promise<any> {
    const periods: Record<string, number> = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
    const ms = periods[period] ?? 86400000;
    const since = new Date(Date.now() - ms);

    const snapshots = await this.prisma.monitoringSnapshot.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    });

    return snapshots.map((s) => ({
      timestamp: s.timestamp.toISOString(),
      totalApps: s.totalApps,
      upCount: s.upCount,
      downCount: s.downCount,
      degradedCount: s.degradedCount,
      data: s.data,
    }));
  }

  async getIncidents(limit = 20, appName?: string) {
    const where: any = {};
    if (appName) where.appName = appName;

    const incidents = await this.prisma.appIncident.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { events: { orderBy: { recordedAt: 'desc' }, take: 50 } },
    });

    return incidents.map((i) => this.toIncidentDto(i));
  }

  async getIncident(id: string) {
    const incident = await this.prisma.appIncident.findUnique({
      where: { id },
      include: { events: { orderBy: { recordedAt: 'asc' } } },
    });
    if (!incident) return null;
    return this.toIncidentDto(incident);
  }

  async getTimeline(period = '7d'): Promise<StatusTimelineDto[]> {
    const periods: Record<string, number> = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
    const ms = periods[period] ?? 604800000;
    const since = new Date(Date.now() - ms);

    const snapshots = await this.prisma.monitoringSnapshot.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    });

    if (snapshots.length === 0) return [];

    const appNames = new Set<string>();
    for (const s of snapshots) {
      if (s.data) {
        const data = s.data as Record<string, any>;
        Object.keys(data).forEach((k) => appNames.add(k));
      }
    }

    return snapshots.map((s) => {
      const data = (s.data ?? {}) as Record<string, any>;
      const apps: Record<string, any> = {};
      for (const name of appNames) {
        apps[name] = data[name]?.status ?? 'UP';
      }
      return {
        date: s.timestamp.toISOString(),
        apps,
      };
    });
  }

  /**
   * Bucketed uptime overview for the status page. Snapshots are produced by
   * the health probe every minute, so:
   *  - hourly  → last 24h in 24 1-hour buckets
   *  - daily   → last 30d in 30 1-day buckets
   *  - monthly → last 365d in 12 1-month buckets
   *  - live    → the current snapshot (single bucket)
   */
  async getOverview(period: 'live' | 'hourly' | 'daily' | 'monthly' = 'hourly'): Promise<StatusOverviewDto> {
    const now = Date.now();
    const cfg = {
      live: { spanMs: 0, buckets: 1, bucketMs: 60_000 },
      hourly: { spanMs: 24 * 3600_000, buckets: 24, bucketMs: 3600_000 },
      daily: { spanMs: 30 * 86400_000, buckets: 30, bucketMs: 86400_000 },
      monthly: { spanMs: 365 * 86400_000, buckets: 12, bucketMs: 0 /* computed per-month */ },
    }[period] ?? { spanMs: 24 * 3600_000, buckets: 24, bucketMs: 3600_000 };

    const since = period === 'live' ? new Date(now - 120_000) : new Date(now - cfg.spanMs);
    const snapshots = await this.prisma.monitoringSnapshot.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    });

    const appNames = new Set<string>();
    for (const s of snapshots) {
      const data = (s.data ?? {}) as Record<string, any>;
      Object.keys(data).forEach((k) => appNames.add(k));
    }
    const apps = [...appNames].sort();

    // Build bucket boundaries
    let bounds: { from: number; to: number; label: string }[] = [];
    if (period === 'live') {
      bounds = [{ from: now - 120_000, to: now, label: new Date(now).toLocaleString() }];
    } else if (period === 'monthly') {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 11);
      start.setDate(1); start.setHours(0, 0, 0, 0);
      for (let i = 0; i < 12; i++) {
        const from = new Date(start); start.setMonth(start.getMonth() + 1);
        const to = new Date(start);
        const label = `${from.toLocaleString(undefined, { month: 'short', year: '2-digit' })}`;
        bounds.push({ from: from.getTime(), to: to.getTime(), label });
      }
    } else {
      for (let i = cfg.buckets - 1; i >= 0; i--) {
        const to = now - i * cfg.bucketMs;
        const from = to - cfg.bucketMs;
        const label = period === 'hourly'
          ? new Date(from).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : new Date(from).toLocaleString(undefined, { month: 'short', day: '2-digit' });
        bounds.push({ from, to, label });
      }
    }

    const buckets: any[] = bounds.map((b) => ({
      label: b.label,
      from: new Date(b.from).toISOString(),
      to: new Date(b.to).toISOString(),
      overallUptime: 0,
      hasData: false,
      apps: {},
    }));

    let totalChecks = 0;
    let totalUp = 0;
    const perAppTotal: Record<string, number> = {};
    const perAppUp: Record<string, number> = {};
    for (const a of apps) { perAppTotal[a] = 0; perAppUp[a] = 0; }

    // Place each snapshot in its bucket
    for (const s of snapshots) {
      const t = s.timestamp.getTime();
      const idx = bounds.findIndex((b) => t >= b.from && t < b.to);
      if (idx === -1) continue;
      const data = (s.data ?? {}) as Record<string, any>;
      let bucketChecks = 0;
      let bucketUp = 0;
      for (const a of apps) {
        const st = data[a]?.status ?? 'UP';
        const up = st !== 'DOWN';
        perAppTotal[a] = (perAppTotal[a] ?? 0) + 1;
        if (up) perAppUp[a] = (perAppUp[a] ?? 0) + 1;
        bucketChecks++; bucketUp += up ? 1 : 0;
        buckets[idx].apps[a] = buckets[idx].apps[a] ?? 0;
        // accumulate into bucket
        (buckets[idx] as any)._checks ??= 0; (buckets[idx] as any)._up ??= 0;
        (buckets[idx] as any)._checks += 1; (buckets[idx] as any)._up += up ? 1 : 0;
      }
      buckets[idx].hasData = true;
      totalChecks += bucketChecks; totalUp += bucketUp;
    }

    // Convert bucket accumulators to percentages
    for (const b of buckets) {
      const checks = (b as any)._checks ?? 0;
      const up = (b as any)._up ?? 0;
      delete (b as any)._checks; delete (b as any)._up;
      b.overallUptime = checks ? Math.round((up / checks) * 100) : 100;
      for (const a of apps) {
        // We didn't track per-app per-bucket counts separately; approximate using
        // whether the app was seen in the bucket (recompute below for accuracy)
        b.apps[a] = checks ? b.apps[a] : 100;
      }
    }

    // Recompute per-app per-bucket uptime accurately
    // (re-loop was avoided above for clarity; do a targeted second pass)
    const perBucketAppChecks: Record<number, Record<string, {c:number;u:number}>> = {};
    snapshots.forEach((s, si) => {
      const t = s.timestamp.getTime();
      const idx = bounds.findIndex((b) => t >= b.from && t < b.to);
      if (idx === -1) return;
      perBucketAppChecks[idx] ??= {};
      const data = (s.data ?? {}) as Record<string, any>;
      for (const a of apps) {
        perBucketAppChecks[idx][a] ??= { c: 0, u: 0 };
        perBucketAppChecks[idx][a].c++;
        if ((data[a]?.status ?? 'UP') !== 'DOWN') perBucketAppChecks[idx][a].u++;
      }
      void si;
    });
    for (const [idxStr, map] of Object.entries(perBucketAppChecks)) {
      const idx = Number(idxStr);
      for (const a of apps) {
        const v = map[a];
        if (v) buckets[idx].apps[a] = Math.round((v.u / v.c) * 100);
      }
    }

    const perAppUptime: Record<string, number> = {};
    for (const a of apps) {
      perAppUptime[a] = perAppTotal[a] ? Math.round((perAppUp[a] / perAppTotal[a]) * 100) : 100;
    }

    // days of history available = from earliest snapshot to now
    const earliest = snapshots[0]?.timestamp.getTime() ?? now;
    const daysOfHistory = Math.max(0, Math.round((now - earliest) / 86400_000));

    return {
      period,
      daysOfHistory,
      buckets,
      apps,
      overallUptime: totalChecks ? Math.round((totalUp / totalChecks) * 100) : 100,
      perAppUptime,
    };
  }

  private toIncidentDto(i: any): AppIncidentDto {
    return {
      id: i.id,
      appName: i.appName,
      status: i.status,
      title: i.title,
      description: i.description,
      startedAt: i.startedAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      durationMs: i.durationMs ? Number(i.durationMs) : null,
      events: (i.events ?? []).map((e: any) => ({
        id: e.id,
        incidentId: e.incidentId,
        status: e.status,
        message: e.message,
        recordedAt: e.recordedAt.toISOString(),
      })),
    };
  }
}

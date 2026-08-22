import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { MetricHistoryDto } from '@hamyar-ops/shared';

type MetricKind = 'cpu' | 'ram' | 'disk' | 'network' | string;

const METRIC_KEYS: Record<string, string> = {
  cpu: 'metrics:cpu',
  ram: 'metrics:ram',
  disk: 'metrics:disk',
  network: 'metrics:network',
};

@Injectable()
export class MonitoringService implements OnModuleInit {
  constructor(
    @InjectQueue('metrics') private metricsQueue: Queue,
    @InjectQueue('alerts') private alertsQueue: Queue,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.metricsQueue.add(
      'collect',
      {},
      { repeat: { every: 5000 }, removeOnComplete: 10, removeOnFail: 5 },
    );
    await this.alertsQueue.add(
      'evaluate',
      {},
      { repeat: { every: 30000 }, removeOnComplete: 5, removeOnFail: 5 },
    );
  }

  async getMetricHistory(metric: MetricKind, period = '1h'): Promise<MetricHistoryDto[]> {
    const key = METRIC_KEYS[metric] ?? `metrics:${metric}`;
    const periods: Record<string, number> = { '1h': 3600000, '6h': 21600000, '24h': 86400000 };
    const ms = periods[period] ?? 3600000;
    const fromMs = Date.now() - ms;
    const toMs = Date.now();

    const history = await this.redis.getMetricHistory(key, fromMs, toMs);
    return history.map((h) => ({
      timestamp: h.ts,
      value: this.extractValue(metric, h),
    }));
  }

  async getAppMetricHistory(appName: string, kind: 'resptime' | 'up', period = '1h'): Promise<MetricHistoryDto[]> {
    const key = `metrics:app:${appName}`;
    const periods: Record<string, number> = { '1h': 3600000, '6h': 21600000, '24h': 86400000 };
    const ms = periods[period] ?? 3600000;
    const history = await this.redis.getMetricHistory(key, Date.now() - ms, Date.now());
    return history.map((h) => ({
      timestamp: h.ts,
      value: kind === 'up' ? (1 - (h.up ?? 1)) : (h.resptime ?? 0),
    }));
  }

  private extractValue(metric: MetricKind, h: any): number {
    if (metric === 'cpu') return h.cpu;
    if (metric === 'ram') return h.ram;
    if (metric === 'disk') return h.value;
    if (metric === 'network') return h.rx;
    return h.value ?? 0;
  }

  async getAlertRules() {
    return this.prisma.alertRule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createAlertRule(data: {
    name: string;
    metric: string;
    appName?: string | null;
    operator: string;
    threshold: number;
    durationSeconds?: number;
    severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  }) {
    return this.prisma.alertRule.create({
      data: {
        name: data.name,
        metric: data.metric,
        appName: data.appName ?? null,
        operator: data.operator,
        threshold: data.threshold,
        durationSeconds: data.durationSeconds ?? 60,
        severity: data.severity ?? 'WARNING',
      },
    });
  }

  async updateAlertRule(id: string, data: Partial<{ name: string; threshold: number; enabled: boolean; appName: string | null }>) {
    return this.prisma.alertRule.update({ where: { id }, data });
  }

  async deleteAlertRule(id: string) {
    return this.prisma.alertRule.delete({ where: { id } });
  }

  async getAlertEvents(limit = 50) {
    return this.prisma.alertEvent.findMany({
      include: { rule: true },
      orderBy: { triggeredAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Available app names + current health snapshot (for the monitoring UI and
   * for building scoped alerts).
   */
  async getMonitoredApps() {
    const apps = await this.prisma.appConfig.findMany({ orderBy: { name: 'asc' } });
    const out: any[] = [];
    for (const app of apps) {
      const raw = await this.redis.get(`app:health:${app.pm2Name}`);
      const health = raw ? JSON.parse(raw) : null;
      out.push({
        pm2Name: app.pm2Name,
        name: app.name,
        domain: app.domain,
        health,
      });
    }
    return out;
  }

  async getHealthStatus() {
    return {
      api: 'healthy',
      database: 'healthy',
      redis: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { AppHealthDto } from '@hamyar-ops/shared';

@Processor('app-health')
export class HealthProbeProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'probe') return;

    const apps = await this.prisma.appConfig.findMany({
      where: { healthUrl: { not: null } },
    });

    const snapshotData: Record<string, { status: string; healthy: boolean; responseTimeMs: number | null }> = {};
    let upCount = 0;
    let downCount = 0;
    let degradedCount = 0;

    for (const app of apps) {
      if (!app.healthUrl) continue;
      const key = `app:health:${app.pm2Name}`;

      const prev: AppHealthDto | null = await this.redis
        .get(key)
        .then((r) => (r ? (JSON.parse(r) as AppHealthDto) : null));

      const start = Date.now();
      let healthy = false;
      let statusCode: number | null = null;
      let responseTimeMs: number | null = null;

      try {
        const res = await fetch(app.healthUrl, {
          signal: AbortSignal.timeout(5000),
        });
        statusCode = res.status;
        responseTimeMs = Date.now() - start;
        healthy = res.ok;
      } catch {
        responseTimeMs = Date.now() - start;
      }

      const wasHealthy = prev?.healthy ?? true;
      const consecutiveFailures = healthy ? 0 : (prev?.consecutiveFailures ?? 0) + 1;

      const status = healthy ? 'UP' : consecutiveFailures >= 3 ? 'DOWN' : 'DEGRADED';
      if (status === 'UP') upCount++;
      else if (status === 'DEGRADED') degradedCount++;
      else downCount++;

      snapshotData[app.pm2Name] = { status, healthy, responseTimeMs };

      const uptimeChecks = await this.redis.lrange(`app:health:history:${app.pm2Name}`, 0, 99);
      const newHistory = [healthy ? '1' : '0', ...uptimeChecks].slice(0, 100);
      await this.redis.del(`app:health:history:${app.pm2Name}`);
      if (newHistory.length) {
        await this.redis.rpush(`app:health:history:${app.pm2Name}`, ...newHistory);
      }
      const uptimePercent = newHistory.length
        ? Math.round((newHistory.filter((v) => v === '1').length / newHistory.length) * 100)
        : 0;

      const result: AppHealthDto = {
        appName: app.pm2Name,
        healthy,
        statusCode,
        responseTimeMs,
        consecutiveFailures,
        uptimePercent,
        checkedAt: new Date().toISOString(),
      };

      await this.redis.set(key, JSON.stringify(result), 'EX', 300);

      // Push per-app metrics for the monitoring charts & alert evaluator
      await this.redis.pushMetric(`metrics:app:${app.pm2Name}`, {
        resptime: responseTimeMs ?? 0,
        up: status !== 'DOWN' ? 1 : 0,
      });

      // Track downtime incidents in database
      await this.trackIncident(app.pm2Name, status, wasHealthy, consecutiveFailures);
    }

    // Save monitoring snapshot
    await this.prisma.monitoringSnapshot.create({
      data: {
        totalApps: apps.length,
        upCount,
        downCount,
        degradedCount,
        data: snapshotData,
      },
    });
  }

  private async trackIncident(appName: string, status: string, wasHealthy: boolean, consecutiveFailures: number) {
    const activeIncident = await this.prisma.appIncident.findFirst({
      where: { appName, resolvedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    if (status === 'UP' && activeIncident) {
      // Resolve incident
      const now = new Date();
      const durationMs = now.getTime() - activeIncident.startedAt.getTime();
      await this.prisma.appIncident.update({
        where: { id: activeIncident.id },
        data: {
          resolvedAt: now,
          durationMs: BigInt(durationMs),
          status: 'UP',
        },
      });
      await this.prisma.appIncidentEvent.create({
        data: {
          incidentId: activeIncident.id,
          status: 'UP',
          message: 'Service recovered',
        },
      });
    } else if (status === 'DOWN' && !activeIncident && !wasHealthy && consecutiveFailures >= 3) {
      // Only create incident if this is the 3rd consecutive failure
      if (consecutiveFailures === 3) {
        const incident = await this.prisma.appIncident.create({
          data: {
            appName,
            status: 'DOWN',
            title: `${appName} is down`,
            description: `Health check failed after ${consecutiveFailures} consecutive attempts`,
          },
        });
        await this.prisma.appIncidentEvent.create({
          data: {
            incidentId: incident.id,
            status: 'DOWN',
            message: `Health check failed - consecutive failures: ${consecutiveFailures}`,
          },
        });
      }
    } else if (status === 'DEGRADED' && activeIncident && activeIncident.status === 'DOWN') {
      // Already have a down incident, add event
      await this.prisma.appIncidentEvent.create({
        data: {
          incidentId: activeIncident.id,
          status: 'DEGRADED',
          message: `Service degraded - failing ${consecutiveFailures} out of recent checks`,
        },
      });
    }
  }
}

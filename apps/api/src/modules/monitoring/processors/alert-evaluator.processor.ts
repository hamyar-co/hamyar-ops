import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';

const OPS: Record<string, (a: number, b: number) => boolean> = {
  gt: (a, b) => a > b,
  lt: (a, b) => a < b,
  gte: (a, b) => a >= b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
};

interface ResolvedMetric {
  key: string;
  pick: (h: any) => number;
}

function resolveMetric(metric: string): ResolvedMetric | null {
  if (metric === 'cpu') return { key: 'metrics:cpu', pick: (h) => h.cpu };
  if (metric === 'ram') return { key: 'metrics:ram', pick: (h) => h.ram };
  if (metric === 'disk') return { key: 'metrics:disk', pick: (h) => h.value };
  if (metric === 'network') return { key: 'metrics:network', pick: (h) => h.rx };

  // App-scoped metrics: "app:<pm2Name>:resptime" or "app:<pm2Name>:down"
  const m = metric.match(/^app:(.+):(resptime|down)$/);
  if (m) {
    const name = m[1];
    const kind = m[2];
    return {
      key: `metrics:app:${name}`,
      pick: (h) => (kind === 'down' ? 1 - (h.up ?? 1) : h.resptime ?? 0),
    };
  }
  return null;
}

@Processor('alerts')
export class AlertEvaluatorProcessor extends WorkerHost {
  constructor(private prisma: PrismaService, private redis: RedisService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'evaluate') return;
    const rules = await this.prisma.alertRule.findMany({ where: { enabled: true } });
    for (const rule of rules) {
      await this.evaluateRule(rule);
    }
  }

  private async evaluateRule(rule: any) {
    const resolved = resolveMetric(rule.metric);
    if (!resolved) return;

    const fromMs = Date.now() - rule.durationSeconds * 1000;
    const history = await this.redis.getMetricHistory(resolved.key, fromMs, Date.now());
    if (!history.length) return;

    const latest = history[history.length - 1];
    const value = resolved.pick(latest);

    const triggered = OPS[rule.operator]?.(value, rule.threshold);
    if (triggered) {
      // Avoid spamming duplicate events: skip if the most recent event for this
      // rule is unresolved.
      const recent = await this.prisma.alertEvent.findFirst({
        where: { ruleId: rule.id, resolvedAt: null },
        orderBy: { triggeredAt: 'desc' },
      });
      if (recent) return;

      await this.prisma.alertEvent.create({
        data: { ruleId: rule.id, value, notified: false },
      });
    }
  }
}
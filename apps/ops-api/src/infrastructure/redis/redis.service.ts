import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const METRICS_TTL_SECONDS = 86400; // 24h

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }

  async onModuleInit() {
    this.on('error', (err) => console.error('Redis error:', err));
  }

  async onModuleDestroy() {
    await this.quit();
  }

  async pushMetric(key: string, value: object): Promise<void> {
    const now = Date.now();
    const score = now;
    const member = JSON.stringify({ ...value, ts: now });
    const cutoff = now - METRICS_TTL_SECONDS * 1000;
    await this.pipeline()
      .zadd(key, score, member)
      .zremrangebyscore(key, '-inf', cutoff)
      .exec();
  }

  async getMetricHistory(
    key: string,
    fromMs: number,
    toMs: number,
  ): Promise<Array<{ ts: number; [k: string]: number }>> {
    const raw = await this.zrangebyscore(key, fromMs, toMs);
    return raw.map((r) => JSON.parse(r));
  }
}

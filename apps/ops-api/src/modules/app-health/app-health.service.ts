import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AppHealthDto, AppSslDto } from '@hamyar-ops/shared';

@Injectable()
export class AppHealthService implements OnModuleInit {
  constructor(
    @InjectQueue('app-health') private healthQueue: Queue,
    @InjectQueue('app-ssl') private sslQueue: Queue,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.healthQueue.add('probe', {}, {
      repeat: { every: 60000 },
      removeOnComplete: 5,
      removeOnFail: 5,
    });

    await this.sslQueue.add('check', {}, {
      repeat: { every: 12 * 60 * 60 * 1000 },
      removeOnComplete: 5,
      removeOnFail: 5,
    });
  }

  async getHealth(pm2Name: string): Promise<AppHealthDto | null> {
    const raw = await this.redis.get(`app:health:${pm2Name}`);
    return raw ? JSON.parse(raw) : null;
  }

  async getSsl(pm2Name: string): Promise<AppSslDto | null> {
    const raw = await this.redis.get(`app:ssl:${pm2Name}`);
    return raw ? JSON.parse(raw) : null;
  }

  async getAllHealth(): Promise<Record<string, AppHealthDto>> {
    const apps = await this.prisma.appConfig.findMany({ where: { healthUrl: { not: null } } });
    const result: Record<string, AppHealthDto> = {};
    for (const app of apps) {
      const h = await this.getHealth(app.pm2Name);
      if (h) result[app.pm2Name] = h;
    }
    return result;
  }

  async getAllSsl(): Promise<Record<string, AppSslDto>> {
    const apps = await this.prisma.appConfig.findMany({ where: { domain: { not: null } } });
    const result: Record<string, AppSslDto> = {};
    for (const app of apps) {
      const s = await this.getSsl(app.pm2Name);
      if (s) result[app.pm2Name] = s;
    }
    return result;
  }
}

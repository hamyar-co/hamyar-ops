import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as tls from 'tls';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { AppSslDto } from '@hamyar-ops/shared';

@Processor('app-ssl')
export class SslCheckerProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'check') return;

    const apps = await this.prisma.appConfig.findMany({
      where: { domain: { not: null } },
    });

    for (const app of apps) {
      if (!app.domain) continue;
      const key = `app:ssl:${app.pm2Name}`;
      const result = await this.checkSsl(app.pm2Name, app.domain);
      await this.redis.set(key, JSON.stringify(result), 'EX', 13 * 60 * 60);
    }
  }

  private checkSsl(appName: string, domain: string): Promise<AppSslDto> {
    return new Promise((resolve) => {
      const socket = tls.connect(
        { host: domain, port: 443, servername: domain, rejectUnauthorized: false },
        () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();

          if (!cert || !cert.valid_to) {
            resolve({
              appName,
              domain,
              daysRemaining: null,
              expiresAt: null,
              issuer: null,
              valid: false,
              checkedAt: new Date().toISOString(),
            });
            return;
          }

          const expiresAt = new Date(cert.valid_to);
          const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const rawIssuer = cert.issuer?.O ?? cert.issuer?.CN ?? null;
          const issuer: string | null = Array.isArray(rawIssuer) ? rawIssuer[0] ?? null : rawIssuer;

          resolve({
            appName,
            domain,
            daysRemaining,
            expiresAt: expiresAt.toISOString(),
            issuer,
            valid: daysRemaining > 0,
            checkedAt: new Date().toISOString(),
          });
        },
      );

      socket.on('error', () => {
        socket.destroy();
        resolve({
          appName,
          domain,
          daysRemaining: null,
          expiresAt: null,
          issuer: null,
          valid: false,
          checkedAt: new Date().toISOString(),
        });
      });

      socket.setTimeout(8000, () => {
        socket.destroy();
        resolve({
          appName,
          domain,
          daysRemaining: null,
          expiresAt: null,
          issuer: null,
          valid: false,
          checkedAt: new Date().toISOString(),
        });
      });
    });
  }
}

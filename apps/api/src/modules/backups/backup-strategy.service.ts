import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { S3StorageService } from './s3-storage.service';
import {
  BackupStrategyDto, CreateBackupStrategyDto, UpdateBackupStrategyDto,
  S3ConfigDto, CreateS3ConfigDto, UpdateS3ConfigDto,
} from '@hamyar-ops/shared';

@Injectable()
export class BackupStrategyService implements OnModuleInit {
  constructor(
    @InjectQueue('backup-strategy') private queue: Queue,
    private prisma: PrismaService,
    private s3: S3StorageService,
  ) {}

  private jobKey(id: string) { return `backup-strategy:${id}`; }

  private async register(strategy: any) {
    if (!strategy.enabled) return;
    await this.queue.add('run', { strategyId: strategy.id }, {
      repeat: { pattern: strategy.scheduleCron },
      jobId: this.jobKey(strategy.id),
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  }

  private async unregister(strategyId: string) {
    const jobs = await this.queue.getRepeatableJobs();
    const job = jobs.find((j) => j.id === this.jobKey(strategyId));
    if (job) await this.queue.removeRepeatableByKey(job.key);
  }

  async onModuleInit() {
    const strategies = await this.prisma.backupStrategy.findMany({ where: { enabled: true } });
    for (const s of strategies) await this.register(s);

    // Daily cleanup of expired local backups (delete anything older than TTL).
    await this.queue.add('cleanup', {}, {
      repeat: { pattern: process.env.BACKUPS_CLEANUP_CRON || '30 3 * * *' },
      jobId: 'backup-strategy:cleanup',
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  }

  // ── Strategies ──
  async listStrategies(): Promise<BackupStrategyDto[]> {
    const list = await this.prisma.backupStrategy.findMany({ orderBy: { name: 'asc' } });
    return list.map((s) => this.toDto(s));
  }

  async getStrategy(id: string): Promise<BackupStrategyDto> {
    const s = await this.prisma.backupStrategy.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Backup strategy not found');
    return this.toDto(s);
  }

  async createStrategy(dto: CreateBackupStrategyDto): Promise<BackupStrategyDto> {
    const s = await this.prisma.backupStrategy.create({
      data: {
        name: dto.name,
        targetType: dto.targetType,
        targets: dto.targets ?? [],
        storage: dto.storage ?? 'local',
        s3ConfigId: dto.s3ConfigId ?? null,
        scheduleCron: dto.scheduleCron,
        retentionMax: dto.retentionMax ?? 24,
        excludeNodeModules: dto.excludeNodeModules ?? true,
        enabled: dto.enabled ?? true,
      },
    });
    await this.register(s);
    return this.toDto(s);
  }

  async updateStrategy(id: string, dto: UpdateBackupStrategyDto): Promise<BackupStrategyDto> {
    await this.unregister(id);
    const s = await this.prisma.backupStrategy.update({ where: { id }, data: dto });
    await this.register(s);
    return this.toDto(s);
  }

  async deleteStrategy(id: string): Promise<void> {
    await this.unregister(id);
    await this.prisma.backupStrategy.delete({ where: { id } });
  }

  // ── S3 configs ──
  async listS3Configs(): Promise<S3ConfigDto[]> {
    const list = await this.prisma.s3Config.findMany({ orderBy: { name: 'asc' } });
    return list.map((c) => this.s3.toDto(c));
  }

  async createS3Config(dto: CreateS3ConfigDto): Promise<S3ConfigDto> {
    const c = await this.prisma.s3Config.create({
      data: {
        name: dto.name,
        endpoint: dto.endpoint,
        region: dto.region || 'default',
        bucket: dto.bucket,
        accessKeyId: dto.accessKeyId,
        secretAccessKey: dto.secretAccessKey,
        usePathStyle: dto.usePathStyle ?? true,
      },
    });
    return this.s3.toDto(c);
  }

  async updateS3Config(id: string, dto: UpdateS3ConfigDto): Promise<S3ConfigDto> {
    const c = await this.prisma.s3Config.update({ where: { id }, data: dto });
    return this.s3.toDto(c);
  }

  async deleteS3Config(id: string): Promise<void> {
    await this.prisma.s3Config.delete({ where: { id } });
  }

  async testS3Config(id: string) { return this.s3.testConnection(id); }

  private toDto(s: any): BackupStrategyDto {
    return {
      id: s.id,
      name: s.name,
      targetType: s.targetType,
      targets: s.targets,
      storage: s.storage,
      s3ConfigId: s.s3ConfigId,
      scheduleCron: s.scheduleCron,
      retentionMax: s.retentionMax,
      excludeNodeModules: s.excludeNodeModules,
      enabled: s.enabled,
      lastRanAt: s.lastRanAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
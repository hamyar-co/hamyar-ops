import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { BackupsService } from './backups.service';

@Processor('backup-strategy')
export class BackupStrategyProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupStrategyProcessor.name);

  constructor(private backups: BackupsService) { super(); }

  async process(job: Job<{ strategyId: string }>): Promise<void> {
    if (job.name === 'cleanup') {
      const n = await this.backups.cleanupExpiredLocal();
      this.logger.log(`cleanup removed ${n} expired local backups`);
      return;
    }
    if (job.name !== 'run') return;
    this.logger.log(`running backup strategy ${job.data.strategyId}`);
    await this.backups.runStrategyBackup(job.data.strategyId);
  }
}
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CronJobsService } from './cron-jobs.service';

@Processor('cron-jobs')
export class CronJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(CronJobsProcessor.name);

  constructor(private cronJobsService: CronJobsService) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    if (job.name !== 'run') return;
    this.logger.log(`Executing cron job ${job.data.jobId}`);
    await this.cronJobsService.executeJob(job.data.jobId);
  }
}

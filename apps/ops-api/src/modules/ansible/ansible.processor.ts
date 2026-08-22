import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AnsibleService } from './ansible.service';

@Processor('ansible')
export class AnsibleProcessor extends WorkerHost {
  private readonly logger = new Logger(AnsibleProcessor.name);

  constructor(private ansibleService: AnsibleService) {
    super();
  }

  async process(job: Job<{ jobId: string; variables?: Record<string, string> | null }>): Promise<void> {
    this.logger.log(`Processing ansible job ${job.data.jobId}`);
    await this.ansibleService.executeJob(job.data.jobId, job.data.variables ?? undefined);
  }
}

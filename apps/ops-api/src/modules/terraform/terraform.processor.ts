import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { TerraformService } from './terraform.service';

@Processor('terraform')
export class TerraformProcessor extends WorkerHost {
  private readonly logger = new Logger(TerraformProcessor.name);

  constructor(private terraform: TerraformService) { super(); }

  async process(job: Job<{ runId: string; workspaceId: string; command: string }>): Promise<void> {
    this.logger.log(`processing terraform run ${job.data.runId} (${job.data.command})`);
    await this.terraform.executeRun(job.data.runId);
  }
}

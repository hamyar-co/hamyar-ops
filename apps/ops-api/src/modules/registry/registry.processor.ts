import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { RegistryService } from './registry.service';
import type { BuildRequestDto } from '@hamyar-ops/shared';

@Processor('registry')
export class RegistryProcessor extends WorkerHost {
  private readonly logger = new Logger(RegistryProcessor.name);

  constructor(private registryService: RegistryService) {
    super();
  }

  async process(job: Job<{ buildId: string; dto: BuildRequestDto }>): Promise<void> {
    if (job.name !== 'build') return;
    this.logger.log(`Executing registry build ${job.data.buildId}`);
    await this.registryService.executeBuild(job.data.buildId, job.data.dto);
  }
}

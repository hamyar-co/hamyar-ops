import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

@Processor('pipeline')
export class PipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(private pipelineService: PipelineService) {
    super();
  }

  async process(job: Job<{ runId?: string; pipelineId?: string }>): Promise<void> {
    if (job.name !== 'run') return;

    // Scheduled jobs pass pipelineId; triggered jobs pass runId
    if (job.data.pipelineId && !job.data.runId) {
      this.logger.log(`Scheduled trigger for pipeline ${job.data.pipelineId}`);
      await this.pipelineService.triggerRun(job.data.pipelineId, 'schedule');
      return;
    }

    if (!job.data.runId) {
      this.logger.warn('Pipeline job missing runId');
      return;
    }

    this.logger.log(`Executing pipeline run ${job.data.runId}`);
    await this.pipelineService.executeRun(job.data.runId);
  }
}

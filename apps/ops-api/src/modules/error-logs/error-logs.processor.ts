import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ErrorLogsService } from './error-logs.service';

@Processor('error-logs')
export class ErrorLogsProcessor extends WorkerHost {
  private readonly logger = new Logger(ErrorLogsProcessor.name);
  constructor(private readonly service: ErrorLogsService) { super(); }

  async process(job: Job): Promise<void> {
    if (job.name !== 'scan') return;
    try {
      const res = await this.service.scanNow();
      if (res.inserted > 0) this.logger.log(`error scan: scanned ${res.scanned}, inserted ${res.inserted}`);
    } catch (err) {
      this.logger.error(`error scan failed: ${(err as Error).message}`);
    }
  }
}
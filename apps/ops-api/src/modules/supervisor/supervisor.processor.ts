import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SupervisorService } from './supervisor.service';

@Processor('supervisor')
export class SupervisorProcessor extends WorkerHost {
  private readonly logger = new Logger(SupervisorProcessor.name);

  constructor(private supervisorService: SupervisorService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'check-all') return;

    this.logger.log('Running supervisor check-all');
    const results = await this.supervisorService.checkAll();
    const down = results.filter((r) => r.status === 'DOWN').length;
    const restarted = results.filter((r) => r.restarted).length;
    this.logger.log(
      `Supervisor check-all done: ${results.length} rules checked, ${down} down, ${restarted} restarted`,
    );
  }
}

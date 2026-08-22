import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PM2Service } from '../pm2/pm2.service';

@Processor('app-scheduler')
export class SchedulerProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private pm2: PM2Service,
  ) {
    super();
  }

  async process(job: Job<{ scheduleId: string; appName: string; action: string }>): Promise<void> {
    if (job.name !== 'run') return;
    const { scheduleId, appName, action } = job.data;

    try {
      if (action === 'restart') await this.pm2.restart(appName);
      else if (action === 'reload') await this.pm2.reload(appName);
      else if (action === 'stop') await this.pm2.stop(appName);

      await this.prisma.appSchedule.update({
        where: { id: scheduleId },
        data: { lastRanAt: new Date() },
      });
    } catch (err) {
      console.error(`Scheduled ${action} failed for ${appName}:`, err);
      throw err;
    }
  }
}

import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupervisorController } from './supervisor.controller';
import { SupervisorService } from './supervisor.service';
import { SupervisorProcessor } from './supervisor.processor';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'supervisor' }),
    EventsModule,
  ],
  controllers: [SupervisorController],
  providers: [SupervisorService, SupervisorProcessor],
  exports: [SupervisorService],
})
export class SupervisorModule implements OnModuleInit {
  constructor(@InjectQueue('supervisor') private supervisorQueue: Queue) {}

  async onModuleInit() {
    // Remove any existing repeating job first to avoid duplicates on restart
    const repeatableJobs = await this.supervisorQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === 'supervisor:check-all') {
        await this.supervisorQueue.removeRepeatableByKey(job.key);
      }
    }

    await this.supervisorQueue.add(
      'check-all',
      {},
      {
        repeat: { every: 60000 },
        jobId: 'supervisor:check-all',
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    );
  }
}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CronJobsController } from './cron-jobs.controller';
import { CronJobsService } from './cron-jobs.service';
import { CronJobsProcessor } from './cron-jobs.processor';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'cron-jobs' }),
    EventsModule,
  ],
  controllers: [CronJobsController],
  providers: [CronJobsService, CronJobsProcessor],
  exports: [CronJobsService],
})
export class CronJobsModule {}

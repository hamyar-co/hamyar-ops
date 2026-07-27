import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { SchedulerProcessor } from './scheduler.processor';
import { PM2Module } from '../pm2/pm2.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'app-scheduler' }),
    PM2Module,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}

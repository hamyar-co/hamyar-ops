import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MetricsCollectorProcessor } from './processors/metrics-collector.processor';
import { AlertEvaluatorProcessor } from './processors/alert-evaluator.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'metrics' },
      { name: 'alerts' },
    ),
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService, MetricsCollectorProcessor, AlertEvaluatorProcessor],
  exports: [MonitoringService],
})
export class MonitoringModule {}

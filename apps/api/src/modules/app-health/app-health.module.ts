import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppHealthService } from './app-health.service';
import { AppHealthController } from './app-health.controller';
import { HealthProbeProcessor } from './processors/health-probe.processor';
import { SslCheckerProcessor } from './processors/ssl-checker.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'app-health' },
      { name: 'app-ssl' },
    ),
  ],
  controllers: [AppHealthController],
  providers: [AppHealthService, HealthProbeProcessor, SslCheckerProcessor],
  exports: [AppHealthService],
})
export class AppHealthModule {}

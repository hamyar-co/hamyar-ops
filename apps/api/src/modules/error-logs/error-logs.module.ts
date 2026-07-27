import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ErrorLogsController } from './error-logs.controller';
import { ErrorLogsService } from './error-logs.service';
import { ErrorLogsProcessor } from './error-logs.processor';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'error-logs' }),
    DockerModule,
  ],
  controllers: [ErrorLogsController],
  providers: [ErrorLogsService, ErrorLogsProcessor],
  exports: [ErrorLogsService],
})
export class ErrorLogsModule {}
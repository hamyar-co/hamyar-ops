import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { S3StorageService } from './s3-storage.service';
import { BackupStrategyService } from './backup-strategy.service';
import { BackupStrategyProcessor } from './backup-strategy.processor';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'backup-strategy' }),
    forwardRef(() => DockerModule),
  ],
  controllers: [BackupsController],
  providers: [BackupsService, S3StorageService, BackupStrategyService, BackupStrategyProcessor],
  exports: [BackupsService, S3StorageService],
})
export class BackupsModule {}
import { Module, forwardRef } from '@nestjs/common';
import { DockerController } from './docker.controller';
import { DockerService } from './docker.service';
import { BackupsModule } from '../backups/backups.module';

@Module({
  imports: [forwardRef(() => BackupsModule)],
  controllers: [DockerController],
  providers: [DockerService],
  exports: [DockerService],
})
export class DockerModule {}

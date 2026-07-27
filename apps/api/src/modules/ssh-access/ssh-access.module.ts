import { Module } from '@nestjs/common';
import { SshAccessController } from './ssh-access.controller';
import { SshAccessService } from './ssh-access.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [SshAccessController],
  providers: [SshAccessService],
  exports: [SshAccessService],
})
export class SshAccessModule {}

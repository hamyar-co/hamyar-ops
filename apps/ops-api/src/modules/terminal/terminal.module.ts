import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TerminalGateway } from './terminal.gateway';
import { SshModule } from '../../infrastructure/ssh/ssh.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [SshModule, JwtModule, EventsModule],
  providers: [TerminalGateway],
})
export class TerminalModule {}

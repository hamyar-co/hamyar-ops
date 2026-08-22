import { Module } from '@nestjs/common';
import { ServerFirewallController } from './server-firewall.controller';
import { ServerFirewallService } from './server-firewall.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ServerFirewallController],
  providers: [ServerFirewallService],
  exports: [ServerFirewallService],
})
export class ServerFirewallModule {}

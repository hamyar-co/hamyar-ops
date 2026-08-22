import { Module, Global } from '@nestjs/common';
import { DeployEventBus } from './deploy-event-bus.service';

@Global()
@Module({
  providers: [DeployEventBus],
  exports: [DeployEventBus],
})
export class EventsBusModule {}

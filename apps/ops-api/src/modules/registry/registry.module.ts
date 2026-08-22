import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';
import { RegistryProcessor } from './registry.processor';
import { MultiServerModule } from '../multi-server/multi-server.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'registry' }),
    forwardRef(() => MultiServerModule),
  ],
  controllers: [RegistryController],
  providers: [RegistryService, RegistryProcessor],
  exports: [RegistryService],
})
export class RegistryModule {}

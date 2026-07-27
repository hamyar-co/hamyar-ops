import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { PipelineProcessor } from './pipeline.processor';
import { MultiServerModule } from '../multi-server/multi-server.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'pipeline' }),
    forwardRef(() => MultiServerModule),
  ],
  controllers: [PipelineController],
  providers: [PipelineService, PipelineProcessor],
  exports: [PipelineService],
})
export class PipelineModule {}

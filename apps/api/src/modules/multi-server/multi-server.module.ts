import { Module } from '@nestjs/common';
import { MultiServerController } from './multi-server.controller';
import { MultiServerService } from './multi-server.service';

@Module({
  controllers: [MultiServerController],
  providers: [MultiServerService],
  exports: [MultiServerService],
})
export class MultiServerModule {}
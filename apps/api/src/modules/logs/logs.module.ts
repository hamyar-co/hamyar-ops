import { Module } from '@nestjs/common';
import { PM2Module } from '../pm2/pm2.module';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [PM2Module],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
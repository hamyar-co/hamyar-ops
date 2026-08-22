import { Module } from '@nestjs/common';
import { PM2Controller } from './pm2.controller';
import { PM2Service } from './pm2.service';

@Module({
  controllers: [PM2Controller],
  providers: [PM2Service],
  exports: [PM2Service],
})
export class PM2Module {}

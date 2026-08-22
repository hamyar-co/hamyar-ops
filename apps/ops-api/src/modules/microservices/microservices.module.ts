import { Module } from '@nestjs/common';
import { MicroservicesController } from './microservices.controller';
import { MicroservicesService } from './microservices.service';
import { NginxModule } from '../nginx/nginx.module';

@Module({
  imports: [NginxModule],
  controllers: [MicroservicesController],
  providers: [MicroservicesService],
  exports: [MicroservicesService],
})
export class MicroservicesModule {}

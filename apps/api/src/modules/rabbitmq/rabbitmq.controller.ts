import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('rabbitmq')
@UseGuards(JwtAuthGuard)
export class RabbitMQController {
  constructor(private readonly rabbitService: RabbitMQService) {}

  @Get('status')
  getStatus() {
    return this.rabbitService.getStatus();
  }

  @Get('queues')
  listQueues() {
    return this.rabbitService.listQueues();
  }

  @Post('queues/:name/purge')
  purgeQueue(@Param('name') name: string) {
    return this.rabbitService.purgeQueue(name);
  }
}

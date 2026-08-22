import { Controller, Get, Delete, Post, Param, Query, UseGuards } from '@nestjs/common';
import { RedisService } from './redis.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('redis')
@UseGuards(JwtAuthGuard)
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('status')
  getStatus() {
    return this.redisService.getStatus();
  }

  @Get('keys')
  listKeys(@Query('pattern') pattern?: string) {
    return this.redisService.listKeys(pattern);
  }

  @Delete('keys/:key')
  deleteKey(@Param('key') key: string) {
    return this.redisService.deleteKey(key);
  }

  @Post('flush')
  flushDb() {
    return this.redisService.flushDb();
  }
}

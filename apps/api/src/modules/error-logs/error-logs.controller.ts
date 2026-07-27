import { Controller, Get, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ErrorLogsService } from './error-logs.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('error-logs')
export class ErrorLogsController {
  constructor(private service: ErrorLogsService) {}

  @Get()
  overview(
    @Query('bucket') bucket: '1h' | '12h' | '24h' | 'daily' | 'weekly' | 'monthly' | 'yearly' = '24h',
    @Query('source') source?: string,
    @Query('sourceName') sourceName?: string,
  ) {
    return this.service.getOverview({ bucket, source, sourceName });
  }

  @Roles('ADMIN')
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  scanNow() { return this.service.scanNow(); }
}
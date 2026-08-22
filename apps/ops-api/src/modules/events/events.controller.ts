import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private events: EventsService) {}

  @Get()
  list(
    @Query('type') type?: string,
    @Query('serverId') serverId?: string,
    @Query('appName') appName?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.events.list({
      type,
      serverId,
      appName,
      severity,
      search,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

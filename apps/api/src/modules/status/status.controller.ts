import { Controller, Get, Param, Query } from '@nestjs/common';
import { StatusService } from './status.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Public()
  @Get()
  getSystemStatus() {
    return this.statusService.getSystemStatus();
  }

  @Public()
  @Get('history')
  getStatusHistory(
    @Query('period') period: string = '24h',
  ) {
    return this.statusService.getStatusHistory(period);
  }

  @Public()
  @Get('incidents')
  getIncidents(
    @Query('limit') limit: string = '20',
    @Query('appName') appName?: string,
  ) {
    return this.statusService.getIncidents(+limit, appName);
  }

  @Public()
  @Get('incidents/:id')
  getIncident(@Param('id') id: string) {
    return this.statusService.getIncident(id);
  }

  @Public()
  @Get('timeline')
  getTimeline(
    @Query('period') period: string = '7d',
  ) {
    return this.statusService.getTimeline(period);
  }

  @Public()
  @Get('overview')
  getOverview(@Query('period') period: 'live' | 'hourly' | 'daily' | 'monthly' = 'hourly') {
    return this.statusService.getOverview(period);
  }
}

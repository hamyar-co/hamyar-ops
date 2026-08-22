import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('monitoring')
export class MonitoringController {
  constructor(private monitoring: MonitoringService) {}

  @Get('history')
  history(
    @Query('metric') metric = 'cpu',
    @Query('period') period = '1h',
  ) { return this.monitoring.getMetricHistory(metric, period); }

  @Get('app/:name/history')
  appHistory(
    @Param('name') name: string,
    @Query('metric') metric = 'resptime',
    @Query('period') period = '1h',
  ) { return this.monitoring.getAppMetricHistory(name, metric as any, period); }

  @Get('apps')
  apps() { return this.monitoring.getMonitoredApps(); }

  @Get('alerts')
  alertRules() { return this.monitoring.getAlertRules(); }

  @Roles('ADMIN')
  @Post('alerts')
  createAlert(@Body() body: any) { return this.monitoring.createAlertRule(body); }

  @Roles('ADMIN')
  @Patch('alerts/:id')
  updateAlert(@Param('id') id: string, @Body() body: any) {
    return this.monitoring.updateAlertRule(id, body);
  }

  @Roles('ADMIN')
  @Delete('alerts/:id')
  deleteAlert(@Param('id') id: string) { return this.monitoring.deleteAlertRule(id); }

  @Get('events')
  alertEvents(@Query('limit') limit = 50) { return this.monitoring.getAlertEvents(+limit); }

  @Public()
  @Get('health')
  health() { return this.monitoring.getHealthStatus(); }
}
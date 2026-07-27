import { Controller, Get, Post, Param } from '@nestjs/common';
import { ObservabilityService } from './observability.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('observability')
export class ObservabilityController {
  constructor(private observability: ObservabilityService) {}

  @Public()
  @Get('status')
  getPublicStatus() {
    return this.observability.getPublicStatus();
  }

  @Get('grafana/:serverId')
  getGrafanaUrl(@Param('serverId') serverId: string) {
    return this.observability.getGrafanaUrl(serverId);
  }

  @Get('prometheus-targets')
  getPrometheusTargets() {
    return this.observability.getPrometheusTargets();
  }

  @Get('install-status/:serverId')
  getInstallStatus(@Param('serverId') serverId: string) {
    return this.observability.getInstallStatus(serverId);
  }

  @Post('install/:serverId')
  @Roles('ADMIN')
  installStack(@Param('serverId') serverId: string) {
    return this.observability.installStack(serverId);
  }
}

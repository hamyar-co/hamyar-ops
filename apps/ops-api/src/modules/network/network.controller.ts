import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { NetworkService } from './network.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('network')
export class NetworkController {
  constructor(private network: NetworkService) {}

  @Get('ports')
  getServerPorts() {
    return this.network.getServerPorts();
  }

  @Roles('ADMIN')
  @Post('ports/:port/allow')
  allowPort(@Param('port') port: string, @Body() body: { protocol?: string }) {
    return this.network.setPortPolicy(parseInt(port, 10), 'allow', body?.protocol || 'tcp');
  }

  @Roles('ADMIN')
  @Post('ports/:port/deny')
  denyPort(@Param('port') port: string, @Body() body: { protocol?: string }) {
    return this.network.setPortPolicy(parseInt(port, 10), 'deny', body?.protocol || 'tcp');
  }

  @Roles('ADMIN')
  @Post('ufw/enable')
  enableUfw() {
    return this.network.ensureEnabled(true);
  }

  @Roles('ADMIN')
  @Post('ufw/disable')
  disableUfw() {
    return this.network.ensureEnabled(false);
  }

  @Roles('ADMIN')
  @Post('ports/:port/restrict-localhost')
  restrictPortToLocalhost(@Param('port') port: string, @Body() body: { protocol?: string }) {
    return this.network.restrictToLocalhost(parseInt(port, 10), body?.protocol || 'tcp');
  }

  @Roles('ADMIN')
  @Post('disable-all-external')
  disableAllExternal() {
    return this.network.disableAllExternalAccess();
  }

  @Roles('ADMIN')
  @Post('enable-external')
  enableExternal(@Body() body: { port?: number } | null) {
    return this.network.enableExternalAccess(body?.port);
  }
}

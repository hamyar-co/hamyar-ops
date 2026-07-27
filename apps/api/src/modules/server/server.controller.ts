import { Controller, Get, Post, Param, Query, ParseIntPipe, DefaultValuePipe, Body } from '@nestjs/common';
import { ServerService } from './server.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('server')
export class ServerController {
  constructor(private server: ServerService) {}

  @Get('metrics')
  metrics() { return this.server.getMetrics(); }

  @Get('processes')
  processes(
    @Query('sort', new DefaultValuePipe('cpu')) sort: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) { return this.server.getProcesses(sort, limit); }

  @Roles('ADMIN')
  @Post('processes/:pid/kill')
  kill(@Param('pid', ParseIntPipe) pid: number) { return this.server.killProcess(pid); }

  @Get('services')
  services() { return this.server.getServices(); }

  @Roles('ADMIN')
  @Post('services/:name/start')
  startService(@Param('name') name: string) { return this.server.controlService(name, 'start'); }

  @Roles('ADMIN')
  @Post('services/:name/stop')
  stopService(@Param('name') name: string) { return this.server.controlService(name, 'stop'); }

  @Roles('ADMIN')
  @Post('services/:name/restart')
  restartService(@Param('name') name: string) { return this.server.controlService(name, 'restart'); }

  @Get('disk')
  disk() { return this.server.getDiskInfo(); }

  @Get('users')
  users() { return this.server.getUsers(); }

  @Get('network')
  network() { return this.server.getNetworkInfo(); }

  @Get('dependencies')
  checkDependencies() { return this.server.checkDependencies(); }

  @Roles('ADMIN')
  @Post('dependencies/:name/install')
  installDependency(@Param('name') name: string) { return this.server.installDependency(name); }

  @Roles('ADMIN')
  @Post('reboot')
  reboot() { return this.server.rebootServer(); }

  @Roles('ADMIN')
  @Post('shutdown')
  shutdown() { return this.server.shutdownServer(); }
}

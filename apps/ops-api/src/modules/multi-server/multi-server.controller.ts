import { Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { MultiServerService } from './multi-server.service';
import {
  ManagedServerDto,
  CreateManagedServerDto,
  UpdateManagedServerDto,
  SshKeyDto,
  CreateSshKeyDto,
  RemoteMetricsDto,
  RemoteCommandResult,
} from '@hamyar-ops/shared';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('servers')
export class MultiServerController {
  constructor(private multi: MultiServerService) {}

  @Get()
  listServers() { return this.multi.listServers(); }

  @Get('keys')
  listSshKeys() { return this.multi.listSshKeys(); }

  @Post('keys')
  createSshKey(@Body() dto: CreateSshKeyDto) { return this.multi.createSshKey(dto); }

  @Delete('keys/:id')
  @Roles('ADMIN')
  deleteSshKey(@Param('id') id: string) { return this.multi.deleteSshKey(id); }

  @Get('metrics')
  getAllRemoteMetrics() { return this.multi.getAllRemoteMetrics(); }

  @Get(':id')
  getServer(@Param('id') id: string) { return this.multi.getServer(id); }

  @Post()
  @Roles('ADMIN')
  createServer(@Body() dto: CreateManagedServerDto) { return this.multi.createServer(dto); }

  @Put(':id')
  @Roles('ADMIN')
  updateServer(@Param('id') id: string, @Body() dto: UpdateManagedServerDto) {
    return this.multi.updateServer(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deleteServer(@Param('id') id: string) { return this.multi.deleteServer(id); }

  @Post(':id/ping')
  pingServer(@Param('id') id: string) { return this.multi.pingServer(id); }

  @Post('ping-all')
  pingAllServers() { return this.multi.pingAllServers(); }

  @Get(':id/metrics')
  getRemoteMetrics(@Param('id') id: string) { return this.multi.getRemoteMetrics(id); }

  @Post(':id/command')
  @Roles('ADMIN')
  executeCommand(@Param('id') id: string, @Body() body: { command: string }) {
    return this.multi.executeRemoteCommand(id, body.command);
  }

  @Post(':id/reboot')
  @Roles('ADMIN')
  rebootRemoteServer(@Param('id') id: string) { return this.multi.rebootRemoteServer(id); }

  @Post(':id/shutdown')
  @Roles('ADMIN')
  shutdownRemoteServer(@Param('id') id: string) { return this.multi.shutdownRemoteServer(id); }
}
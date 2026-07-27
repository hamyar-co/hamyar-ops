import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ServerConfigService } from './server-config.service';
import { Roles } from '../../common/decorators/roles.decorator';
import type {
  SetHostnameDto,
  UpdateHostsFileDto,
  AddHostsEntryDto,
  SetNameserversDto,
} from '@hamyar-ops/shared';

@Controller('server-config')
export class ServerConfigController {
  constructor(private readonly serverConfig: ServerConfigService) {}

  // ─── Hostname ─────────────────────────────────────────────────────────────

  @Get(':serverId/hostname')
  getHostname(@Param('serverId') serverId: string) {
    return this.serverConfig.getHostname(serverId);
  }

  @Patch(':serverId/hostname')
  @Roles('ADMIN')
  setHostname(@Param('serverId') serverId: string, @Body() dto: SetHostnameDto) {
    return this.serverConfig.setHostname(serverId, dto.hostname);
  }

  // ─── /etc/hosts ───────────────────────────────────────────────────────────

  @Get(':serverId/hosts')
  getHostsFile(@Param('serverId') serverId: string) {
    return this.serverConfig.getHostsFile(serverId);
  }

  @Put(':serverId/hosts')
  @Roles('ADMIN')
  updateHostsFile(@Param('serverId') serverId: string, @Body() dto: UpdateHostsFileDto) {
    return this.serverConfig.updateHostsFile(serverId, dto.content);
  }

  @Post(':serverId/hosts/entry')
  @Roles('ADMIN')
  addHostsEntry(@Param('serverId') serverId: string, @Body() dto: AddHostsEntryDto) {
    return this.serverConfig.addHostsEntry(serverId, dto.ip, dto.hostname, dto.aliases, dto.comment);
  }

  @Delete(':serverId/hosts/:lineNum')
  @Roles('ADMIN')
  removeHostsEntry(
    @Param('serverId') serverId: string,
    @Param('lineNum', ParseIntPipe) lineNum: number,
  ) {
    return this.serverConfig.removeHostsEntry(serverId, lineNum);
  }

  // ─── /etc/resolv.conf ─────────────────────────────────────────────────────

  @Get(':serverId/resolv')
  getResolvConf(@Param('serverId') serverId: string) {
    return this.serverConfig.getResolvConf(serverId);
  }

  @Put(':serverId/resolv')
  @Roles('ADMIN')
  setNameservers(@Param('serverId') serverId: string, @Body() dto: SetNameserversDto) {
    return this.serverConfig.setNameservers(serverId, dto.nameservers, dto.search ?? []);
  }

  // ─── SSH password auth ────────────────────────────────────────────────────

  @Get(':serverId/password-auth')
  getPasswordAuthStatus(@Param('serverId') serverId: string) {
    return this.serverConfig.getPasswordAuthStatus(serverId);
  }

  @Patch(':serverId/password-auth')
  @Roles('ADMIN')
  setPasswordAuth(
    @Param('serverId') serverId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.serverConfig.setPasswordAuth(serverId, body.enabled);
  }
}

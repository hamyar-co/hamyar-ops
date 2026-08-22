import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { NginxService } from './nginx.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateNginxConfigDto, ValidateNginxDto } from '@hamyar-ops/shared';

@Controller('nginx')
export class NginxController {
  constructor(private nginx: NginxService) {}

  @Get('configs')
  listConfigs() { return this.nginx.listConfigs(); }

  @Get('configs/:name')
  getConfig(@Param('name') name: string) { return this.nginx.getConfig(name); }

  @Roles('ADMIN')
  @Patch('configs/:name')
  updateConfig(@Param('name') name: string, @Body() dto: UpdateNginxConfigDto) {
    return this.nginx.updateConfig(name, dto.content);
  }

  @Post('validate')
  validate(@Body() dto: ValidateNginxDto) { return this.nginx.validateContent(dto.content); }

  @Roles('ADMIN')
  @Post('reload')
  reload() { return this.nginx.reload(); }

  @Roles('ADMIN')
  @Post('restart')
  restart() { return this.nginx.restart(); }

  @Get('status')
  status() { return this.nginx.getStatus(); }

  @Get('ssl')
  ssl() { return this.nginx.getSslStatus(); }

  @Roles('ADMIN')
  @Post('sites/:name/enable')
  enableSite(@Param('name') name: string) { return this.nginx.enableSite(name); }

  @Roles('ADMIN')
  @Post('sites/:name/disable')
  disableSite(@Param('name') name: string) { return this.nginx.disableSite(name); }
}

import { Controller, Get, Put, Post, Param, Body } from '@nestjs/common';
import { EnvEditorService } from './env-editor.service';
import { EnvVarDto } from '@hamyar-ops/shared';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('env')
export class EnvEditorController {
  constructor(private readonly envEditorService: EnvEditorService) {}

  @Get(':appName')
  getEnvVars(@Param('appName') appName: string) {
    return this.envEditorService.getEnvVars(appName);
  }

  @Put(':appName')
  @Roles('ADMIN')
  updateEnvVars(@Param('appName') appName: string, @Body() body: { vars: EnvVarDto[] }) {
    return this.envEditorService.updateEnvVars(appName, body.vars);
  }

  @Put(':appName/raw')
  @Roles('ADMIN')
  updateEnvRaw(@Param('appName') appName: string, @Body() body: { raw: string }) {
    return this.envEditorService.updateEnvRaw(appName, body.raw);
  }

  @Post(':appName/restart')
  @Roles('ADMIN')
  saveAndRestart(@Param('appName') appName: string, @Body() body: { vars: EnvVarDto[] }) {
    return this.envEditorService.saveAndRestart(appName, body.vars);
  }
}

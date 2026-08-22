import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { PM2Service } from './pm2.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePM2ProcessDto, UpdatePM2ProcessDto } from '@hamyar-ops/shared';
import * as pm2 from 'pm2';

@Controller('pm2')
export class PM2Controller {
  constructor(private pm2: PM2Service) {}

  @Get('processes')
  list() {
    return this.pm2.list();
  }

  @Get('processes/:name')
  describe(@Param('name') name: string) {
    return this.pm2.describe(name);
  }

  @Get('processes/:name/logs')
  logs(
    @Param('name') name: string,
    @Query('lines', new DefaultValuePipe(200), ParseIntPipe) lines: number,
  ) {
    return this.pm2.getLogs(name, lines);
  }

  @Roles('ADMIN')
  @Post('processes/:name/restart')
  restart(@Param('name') name: string) {
    return this.pm2.restart(name);
  }

  @Roles('ADMIN')
  @Post('processes/:name/stop')
  stop(@Param('name') name: string) {
    return this.pm2.stop(name);
  }

  @Roles('ADMIN')
  @Post('processes/:name/reload')
  reload(@Param('name') name: string) {
    return this.pm2.reload(name);
  }

  @Roles('ADMIN')
  @Delete('processes/:name')
  delete(@Param('name') name: string) {
    return this.pm2.delete(name);
  }

  @Roles('ADMIN')
  @Post('processes')
  create(@Body() dto: CreatePM2ProcessDto) {
    const opts: pm2.StartOptions = {
      name: dto.name,
      script: dto.script,
      cwd: dto.cwd,
      args: dto.args,
      interpreter: dto.interpreter,
      instances: dto.instances ?? 1,
      exec_mode: dto.execMode ?? 'fork',
      env: dto.env,
      max_memory_restart: dto.maxMemoryRestart,
    };
    if (dto.errorFile) (opts as any).error_file = dto.errorFile;
    if (dto.outFile) (opts as any).out_file = dto.outFile;
    return this.pm2.start(opts);
  }

  @Roles('ADMIN')
  @Post('save')
  save() {
    return this.pm2.save();
  }
}

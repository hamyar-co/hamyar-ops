import { Controller, Get, Param, Query, Res, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { Response } from 'express';
import { LogsService } from './logs.service';

@Controller('logs')
export class LogsController {
  constructor(private logs: LogsService) {}

  @Get('sources')
  sources() { return this.logs.getSources(); }

  @Get('pm2/:process')
  pm2Logs(
    @Param('process') process: string,
    @Query('lines', new DefaultValuePipe(500), ParseIntPipe) lines: number,
    @Query('level') level?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) { return this.logs.getPM2Logs(process, lines, level, since, until); }

  @Get('pm2/:process/download')
  async downloadPm2(
    @Param('process') process: string,
    @Query('level') level: 'error' | 'out' = 'out',
    @Res() res: Response,
  ) { return this.logs.downloadPm2(process, level, res); }

  @Get('nginx/:type')
  nginxLogs(
    @Param('type') type: string,
    @Query('lines', new DefaultValuePipe(500), ParseIntPipe) lines: number,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) { return this.logs.getNginxLogs(type, lines, since, until); }

  @Get('system')
  systemLogs(
    @Query('unit', new DefaultValuePipe('nginx')) unit: string,
    @Query('lines', new DefaultValuePipe(200), ParseIntPipe) lines: number,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) { return this.logs.getSystemLogs(unit, lines, since, until); }

  @Get('download')
  download(@Query('path') filePath: string, @Res() res: Response) {
    return this.logs.streamDownload(filePath, res);
  }
}

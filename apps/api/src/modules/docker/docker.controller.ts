import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Response } from 'express';
import { DockerService } from './docker.service';
import { BackupsService } from '../backups/backups.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { PullImageDto, ComposeUpDto, ComposeRunDto, DatabaseDumpDto } from '@hamyar-ops/shared';

@Roles('ADMIN')
@Controller('docker')
export class DockerController {
  constructor(
    private docker: DockerService,
    private backups: BackupsService,
  ) {}

  @Get('containers')
  listContainers() {
    return this.docker.listContainers();
  }

  @Get('containers/:id/inspect')
  inspect(@Param('id') id: string) {
    return this.docker.inspectContainer(id);
  }

  @Get('containers/:id/logs')
  logs(
    @Param('id') id: string,
    @Query('lines', new DefaultValuePipe(200), ParseIntPipe) lines: number,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    return this.docker.getContainerLogs(id, lines, since, until);
  }

  @Get('containers/:id/stats')
  getContainerStats(@Param('id') id: string) {
    return this.docker.getContainerStats(id);
  }

  @Get('containers/stats')
  getAllContainerStats() {
    return this.docker.getAllContainerStats();
  }

  @Roles('ADMIN')
  @Post('containers/:id/start')
  start(@Param('id') id: string) {
    return this.docker.startContainer(id);
  }

  @Roles('ADMIN')
  @Post('containers/:id/stop')
  stop(@Param('id') id: string) {
    return this.docker.stopContainer(id);
  }

  @Roles('ADMIN')
  @Post('containers/:id/restart')
  restart(@Param('id') id: string) {
    return this.docker.restartContainer(id);
  }

  @Roles('ADMIN')
  @Delete('containers/:id')
  remove(@Param('id') id: string) {
    return this.docker.removeContainer(id);
  }

  @Get('images')
  listImages() {
    return this.docker.listImages();
  }

  @Roles('ADMIN')
  @Post('images/pull')
  pullImage(@Body() dto: PullImageDto) {
    return this.docker.pullImage(dto.image);
  }

  @Roles('ADMIN')
  @Delete('images/:id')
  removeImage(@Param('id') id: string) {
    return this.docker.removeImage(id);
  }

  @Get('networks')
  listNetworks() {
    return this.docker.listNetworks();
  }

  @Get('volumes')
  listVolumes() {
    return this.docker.listVolumes();
  }

  @Roles('ADMIN')
  @Post('compose/up')
  composeUp(@Body() dto: ComposeUpDto) {
    return this.docker.composeUp(dto.services);
  }

  @Roles('ADMIN')
  @Post('compose/down')
  composeDown() {
    return this.docker.composeDown();
  }

  @Roles('ADMIN')
  @Post('compose/pull')
  composePull() {
    return this.docker.composePull();
  }

  // ── Compose upload + run ──
  @Roles('ADMIN')
  @Post('compose/run')
  composeRun(@Body() dto: ComposeRunDto) {
    return this.docker.composeRun(dto);
  }

  @Roles('ADMIN')
  @Post('compose/down/:name')
  composeDownByName(@Param('name') name: string) {
    return this.docker.composeDownByName(name);
  }

  @Get('compose/files')
  listComposeFiles() {
    return this.docker.listComposeFiles();
  }

  @Get('compose/files/:name')
  getComposeFile(@Param('name') name: string, @Res() res: Response) {
    const file = this.docker.getComposeFile(name);
    res.setHeader('Content-Type', 'text/yaml');
    res.sendFile(file);
  }

  // ── Backup / restore for containers ──
  @Roles('ADMIN')
  @Post('containers/:id/backup')
  backupContainer(@Param('id') id: string) {
    return this.backups.runAdHoc('container', id);
  }

  @Get('containers/:id/backups')
  listContainerBackups(@Param('id') id: string) {
    return this.backups.listForTarget('container', id);
  }

  @Roles('ADMIN')
  @Post('containers/:id/restore/:backupId')
  restoreContainer(@Param('backupId') backupId: string, @Body() body: { overwrite?: boolean }) {
    return this.backups.restore(backupId, { overwrite: body.overwrite ?? true });
  }

  // ── Database dump / restore (direct .sql) ──
  @Get('db/dump')
  async dbDump(
    @Query('containerId') containerId: string,
    @Query('engine') engine: 'postgres' | 'mysql',
    @Query('database') database: string,
    @Query('user') user: string | undefined,
    @Res() res: Response,
  ) {
    const buf = await this.docker.dbDumpSql(engine, containerId, database, user);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${database}-${new Date().toISOString().slice(0, 10)}.sql"`,
    );
    res.send(buf);
  }

  @Roles('ADMIN')
  @Post('db/backup')
  backupDatabase(@Body() dto: DatabaseDumpDto) {
    const target = `${dto.containerId}::${dto.engine}::${dto.database}${dto.username ? `::${dto.username}` : ''}`;
    return this.backups.runAdHoc('database', target);
  }

  @Get('db/backups')
  listDbBackups(
    @Query('containerId') containerId: string,
    @Query('engine') engine: 'postgres' | 'mysql',
    @Query('database') database: string,
    @Query('user') user: string | undefined,
  ) {
    const target = `${containerId}::${engine}::${database}${user ? `::${user}` : ''}`;
    return this.backups.listForTarget('database', target);
  }

  @Get('db/databases')
  listDatabases() {
    return this.docker.listDatabases();
  }

  @Roles('ADMIN')
  @Post('db/restore/:backupId')
  restoreDb(@Param('backupId') backupId: string) {
    return this.backups.restore(backupId, {});
  }

  // ── Generic backups (download + restore + delete) ──
  @Get('backups/:id/download')
  async downloadBackup(@Param('id') id: string, @Res() res: Response) {
    const rec = await this.backups.getRecord(id);
    if (!rec) {
      res.status(404).send('not found');
      return;
    }
    const buf = await this.backups.getArchiveBuffer(rec);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${rec.fileName || 'backup.tar.gz'}"`,
    );
    res.send(buf);
  }

  @Roles('ADMIN')
  @Delete('backups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBackup(@Param('id') id: string) {
    return this.backups.deleteRecord(id);
  }
}

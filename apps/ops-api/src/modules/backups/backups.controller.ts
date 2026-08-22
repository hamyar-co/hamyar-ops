import {
  Controller, Get, Post, Put, Delete, Param, Body, Res, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { BackupsService } from './backups.service';
import { BackupStrategyService } from './backup-strategy.service';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  BackupTargetType,
  CreateBackupStrategyDto, UpdateBackupStrategyDto,
  CreateS3ConfigDto, UpdateS3ConfigDto,
  CreateFullBackupDto,
} from '@hamyar-ops/shared';

@Controller('backups')
export class BackupsController {
  constructor(
    private backups: BackupsService,
    private strategies: BackupStrategyService,
  ) {}

  // ── Run ad-hoc backup (per-app / docker / db buttons) ──
  @Roles('ADMIN')
  @Post('run')
  runAdHoc(@Body() body: { targetType: BackupTargetType; targetName: string }) {
    return this.backups.runAdHoc(body.targetType, body.targetName);
  }

  @Roles('ADMIN')
  @Post('restore/:id')
  restore(@Param('id') id: string, @Body() body: { overwrite?: boolean }) {
    return this.backups.restore(id, { overwrite: body.overwrite ?? false });
  }

  // ── List per-target ──
  @Get('list/:targetType/:targetName')
  listForTarget(
    @Param('targetType') targetType: BackupTargetType,
    @Param('targetName') targetName: string,
  ) {
    return this.backups.listForTarget(targetType, targetName);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string) { return this.backups.deleteRecord(id); }

  // ── Download ──
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const rec = await this.backups.getRecord(id);
    if (!rec) { res.status(404).send('not found'); return; }
    const buf = await this.backups.getArchiveBuffer(rec);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${rec.fileName || 'backup.tar.gz'}"`);
    res.send(buf);
  }

  // ── Backup strategies ──
  @Get('strategies')
  listStrategies() { return this.strategies.listStrategies(); }

  @Roles('ADMIN')
  @Post('strategies')
  createStrategy(@Body() dto: CreateBackupStrategyDto) { return this.strategies.createStrategy(dto); }

  @Roles('ADMIN')
  @Put('strategies/:id')
  updateStrategy(@Param('id') id: string, @Body() dto: UpdateBackupStrategyDto) { return this.strategies.updateStrategy(id, dto); }

  @Roles('ADMIN')
  @Delete('strategies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteStrategy(@Param('id') id: string) { return this.strategies.deleteStrategy(id); }

  // ── S3 configs ──
  @Get('s3')
  listS3() { return this.strategies.listS3Configs(); }

  @Roles('ADMIN')
  @Post('s3')
  createS3(@Body() dto: CreateS3ConfigDto) { return this.strategies.createS3Config(dto); }

  @Roles('ADMIN')
  @Put('s3/:id')
  updateS3(@Param('id') id: string, @Body() dto: UpdateS3ConfigDto) { return this.strategies.updateS3Config(id, dto); }

  @Roles('ADMIN')
  @Delete('s3/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteS3(@Param('id') id: string) { return this.strategies.deleteS3Config(id); }

  @Roles('ADMIN')
  @Post('s3/:id/test')
  testS3(@Param('id') id: string) { return this.strategies.testS3Config(id); }

  // ── Full backup (server migration) ──
  @Get('full')
  listFullBackups() { return this.backups.listFullBackups(); }

  @Roles('ADMIN')
  @Post('full')
  runFullBackup(@Body() dto: CreateFullBackupDto) {
    return this.backups.runFullBackup({
      name: dto.name,
      includeApps: dto.includeApps,
      includeDatabases: dto.includeDatabases,
      includeSshKeys: dto.includeSshKeys,
      includeEnvVars: dto.includeEnvVars,
      includeDockerConfigs: dto.includeDockerConfigs,
      storage: dto.storage,
      s3ConfigId: dto.s3ConfigId,
    });
  }

  @Roles('ADMIN')
  @Post('full/:id/restore')
  restoreFullBackup(@Param('id') id: string, @Body() body: { overwrite?: boolean }) {
    return this.backups.restoreFullBackup(id, { overwrite: body.overwrite ?? false });
  }

  @Get('full/:id/download')
  async downloadFullBackup(@Param('id') id: string, @Res() res: Response) {
    const rec = await this.backups.getRecord(id);
    if (!rec) { res.status(404).send('not found'); return; }
    const buf = await this.backups.getArchiveBuffer(rec);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${rec.fileName || 'full-backup.tar.gz'}"`);
    res.send(buf);
  }

  @Roles('ADMIN')
  @Delete('full/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFullBackup(@Param('id') id: string) { return this.backups.deleteRecord(id); }
}
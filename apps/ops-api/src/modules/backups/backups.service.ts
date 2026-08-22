import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { S3StorageService } from './s3-storage.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { WsEvents, type BackupTargetType, type BackupRecordDto, type RunBackupResponseDto, type RestoreResultDto } from '@hamyar-ops/shared';
import { DockerService } from '../docker/docker.service';

const exec = promisify(execFile);

const BACKUPS_DIR = process.env.BACKUPS_DIR || '/var/backups/hamyar-ops';
const LOCAL_TTL_HOURS = parseInt(process.env.BACKUPS_LOCAL_TTL_HOURS || '24', 10);

// Source-exclusion defaults for app tarballs. These represent the runtime
// dependencies/build artefacts that should not be part of an app backup.
const EXCLUDES = ['node_modules', '.next', 'dist', '.turbo', '.git', '.cache', 'coverage'];

const COMPOSE_FILE = process.env.DOCKER_COMPOSE_FILE || '/opt/hamyar/backend/docker-compose.yml';

@Injectable()
export class BackupsService implements OnModuleInit {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3StorageService,
    private eventBus: DeployEventBus,
    @Inject(forwardRef(() => DockerService))
    private dockerService: DockerService,
  ) {}

  onModuleInit() {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  // ───────────────────────────────────────────────────────────────────
  // Public: ad-hoc backup (per-app / docker / db buttons)
  // ───────────────────────────────────────────────────────────────────
  async runAdHoc(targetType: BackupTargetType, targetName: string): Promise<RunBackupResponseDto> {
    const record = await this.prisma.backupRecord.create({
      data: {
        targetType,
        targetName,
        storage: 'local',
        fileName: '',
        status: 'RUNNING',
      },
    });
    // fire and forget — stream logs via websocket
    this.executeBackup(record.id, targetType, targetName, null).catch((e) =>
      this.logger.error(`ad-hoc backup failed: ${e?.message}`),
    );
    return { recordId: record.id, status: 'RUNNING', message: 'Backup started' };
  }

  // ───────────────────────────────────────────────────────────────────
  // Core backup execution — writes a .tar.gz to BACKUPS_DIR
  // ───────────────────────────────────────────────────────────────────
  private async executeBackup(
    recordId: string,
    targetType: BackupTargetType,
    targetName: string,
    strategyId: string | null,
  ): Promise<void> {
    const emit = (line: string, stream: 'stdout' | 'stderr' = 'stdout') =>
      this.eventBus.emit(WsEvents.BACKUP_LOG, { recordId, targetType, targetName, line, stream });

    this.eventBus.emit(WsEvents.BACKUP_START, { recordId, targetType, targetName });
    const lines: string[] = [];
    const log = (l: string) => { lines.push(l); emit(l); };

    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safe = targetName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const fileName = `${targetType}-${safe}-${stamp}.tar.gz`;
      const outPath = path.join(BACKUPS_DIR, fileName);
      log(`→ destination: ${outPath}`);

      if (targetType === 'app') await this.backupApp(targetName, outPath, log);
      else if (targetType === 'database') await this.backupDatabase(targetName, outPath, log);
      else if (targetType === 'container') await this.backupContainer(targetName, outPath, log);
      else if (targetType === 'compose') await this.backupCompose(targetName, outPath, log);
      else throw new BadRequestException(`Unknown backup target type ${targetType}`);

      const stat = fs.statSync(outPath);
      const sizeBytes = stat.size;

      let storage: 'local' | 's3' = 'local';
      let s3Key: string | null = null;
      let localPath: string | null = outPath;
      let expiresAt: Date | null = new Date(Date.now() + LOCAL_TTL_HOURS * 3600 * 1000);

      // offload to S3 if a strategy is attached and configured for s3
      if (strategyId) {
        const strategy = await this.prisma.backupStrategy.findUnique({ where: { id: strategyId } });
        if (strategy?.storage === 's3' && strategy.s3ConfigId) {
          s3Key = `backups/${targetType}/${targetName}/${fileName}`;
          log(`→ uploading to S3: ${s3Key}`);
          const buf = fs.readFileSync(outPath);
          await this.s3.upload(strategy.s3ConfigId, s3Key, buf);
          storage = 's3';
          // local copy removed once uploaded (downloadable from S3)
          fs.unlinkSync(outPath);
          localPath = null;
          expiresAt = null;
          log(`✓ uploaded (${this.fmtSize(sizeBytes)})`);
        } else {
          log(`✓ local backup created (${this.fmtSize(sizeBytes)})`);
        }
        await this.enforceRetention(strategy);
      } else {
        log(`✓ local backup created (${this.fmtSize(sizeBytes)})`);
      }

      await this.prisma.backupRecord.update({
        where: { id: recordId },
        data: {
          strategyId,
          storage,
          sizeBytes: BigInt(sizeBytes),
          fileName,
          localPath,
          s3Key,
          status: 'SUCCESS',
          expiresAt: expiresAt ? expiresAt : null,
        },
      });
      this.eventBus.emit(WsEvents.BACKUP_DONE, { recordId, targetType, targetName, status: 'SUCCESS' });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      log(`✗ failed: ${msg}`);
      await this.prisma.backupRecord.update({
        where: { id: recordId },
        data: { status: 'FAILED', message: msg },
      }).catch(() => {});
      this.eventBus.emit(WsEvents.BACKUP_DONE, { recordId, targetType, targetName, status: 'FAILED', message: msg });
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // APP backup: tar the deployPath, excluding build artefacts/deps
  // Plus an optional DB dump if the app has dbType/dbName configured
  // ───────────────────────────────────────────────────────────────────
  private async backupApp(pm2Name: string, outPath: string, log: (l: string) => void) {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    const deployPath = cfg.deployPath || (cfg.envPath ? path.dirname(cfg.envPath) : null);
    if (!deployPath) throw new BadRequestException(`No deployPath or envPath configured for ${pm2Name}`);
    if (!fs.existsSync(deployPath)) throw new BadRequestException(`deployPath ${deployPath} does not exist`);

    const staging = fs.mkdtempSync('/tmp/hamyar-backup-');
    const appStage = path.join(staging, 'app');
    fs.mkdirSync(appStage);
    log(`staging app files from ${deployPath}`);

    const excludeArgs = EXCLUDES.flatMap((e) => ['--exclude', e]);
    // tar app dir into staging (preserving tree minus excludes)
    await exec('tar', ['-czf', path.join(appStage, 'app.tar.gz'), '-C', deployPath, ...excludeArgs, '.']);
    log(`archived app tree (${EXCLUDES.length} excludes)`);

    // optional embedded DB dump
    if (cfg.dbType && cfg.dbName) {
      try {
        const dumpFile = path.join(appStage, 'database.sql');
        await this.dumpDatabaseByConfig(cfg.dbType, cfg.dbName, cfg.containerName ?? null, dumpFile, log);
      } catch (e: any) {
        log(`! db dump skipped: ${e.message}`);
      }
    }

    // include env file if separate from deployPath
    if (cfg.envPath && cfg.envPath !== path.join(deployPath, '.env')) {
      try {
        fs.copyFileSync(cfg.envPath, path.join(staging, 'env', path.basename(cfg.envPath) || '.env'));
      } catch {}
    }

    // write meta
    fs.writeFileSync(path.join(staging, 'meta.json'), JSON.stringify({
      pm2Name, deployPath, envPath: cfg.envPath, dbType: cfg.dbType, dbName: cfg.dbName,
      backedUpAt: new Date().toISOString(),
    }, null, 2));

    await exec('tar', ['-czf', outPath, '-C', staging, '.']);
    fs.rmSync(staging, { recursive: true, force: true });
  }

  // ───────────────────────────────────────────────────────────────────
  // DATABASE backup: produce a .sql then wrap into a tar.gz
  // targetName format: "<containerId|containerName>::<engine>::<db>::[user]"
  // ───────────────────────────────────────────────────────────────────
  private async backupDatabase(targetName: string, outPath: string, log: (l: string) => void) {
    const [container, engine, db, user] = targetName.split('::');
    if (!container || !engine || !db) throw new BadRequestException('database target must be container::engine::db[::user]');
    const staging = fs.mkdtempSync('/tmp/hamyar-backup-');
    const dumpFile = path.join(staging, 'database.sql');
    await this.dumpDatabase(engine as 'postgres' | 'mysql', db, container, dumpFile, log, user);
    fs.writeFileSync(path.join(staging, 'meta.json'), JSON.stringify({ container, engine, db, user: user ?? null }));
    await exec('tar', ['-czf', outPath, '-C', staging, '.']);
    fs.rmSync(staging, { recursive: true, force: true });
  }

  private async dumpDatabaseByConfig(engine: string, db: string, container: string | null, dumpFile: string, log: (l: string) => void) {
    if (!container) throw new Error('containerName required to dump DB');
    await this.dumpDatabase(engine as 'postgres' | 'mysql', db, container, dumpFile, log);
  }

  private async dumpDatabase(
    engine: 'postgres' | 'mysql',
    db: string,
    container: string,
    dumpFile: string,
    log: (l: string) => void,
    user?: string,
  ) {
    if (container.startsWith('local-')) {
      if (engine === 'postgres') {
        const u = user || 'postgres';
        log(`pg_dump -U ${u} ${db} (Local Host)`);
        const { stdout } = await exec('pg_dump', ['-U', u, '--no-owner', '--clean', '--if-exists', db], { maxBuffer: 1024 * 1024 * 1024 });
        fs.writeFileSync(dumpFile, stdout);
        log(`dumped ${this.fmtSize(Buffer.byteLength(stdout))}`);
      } else if (engine === 'mysql') {
        const u = user || 'root';
        log(`mysqldump -u ${u} ${db} (Local Host)`);
        const { stdout } = await exec('mysqldump', ['-u', u, db], { maxBuffer: 1024 * 1024 * 1024 });
        fs.writeFileSync(dumpFile, stdout);
        log(`dumped ${this.fmtSize(Buffer.byteLength(stdout))}`);
      } else {
        throw new BadRequestException(`Unsupported db engine ${engine}`);
      }
      return;
    }

    if (engine === 'postgres') {
      const u = user || 'postgres';
      log(`pg_dump -U ${u} ${db} (in ${container})`);
      const { stdout } = await exec('docker', ['exec', container, 'pg_dump', '-U', u, '--no-owner', '--clean', '--if-exists', db], { maxBuffer: 1024 * 1024 * 1024 });
      fs.writeFileSync(dumpFile, stdout);
      log(`dumped ${this.fmtSize(Buffer.byteLength(stdout))}`);
    } else if (engine === 'mysql') {
      const u = user || 'root';
      log(`mysqldump -u ${u} ${db} (in ${container})`);
      const cmd = ['exec', container, 'sh', '-c', `mysqldump -u ${u} ${db}`];
      const { stdout } = await exec('docker', cmd, { maxBuffer: 1024 * 1024 * 1024 });
      fs.writeFileSync(dumpFile, stdout);
      log(`dumped ${this.fmtSize(Buffer.byteLength(stdout))}`);
    } else {
      throw new BadRequestException(`Unsupported db engine ${engine}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // CONTAINER backup: inspect config + named volume snapshots
  // ───────────────────────────────────────────────────────────────────
  private async backupContainer(containerIdOrName: string, outPath: string, log: (l: string) => void) {
    const staging = fs.mkdtempSync('/tmp/hamyar-backup-');
    const { stdout: inspectOut } = await exec('docker', ['inspect', containerIdOrName], { maxBuffer: 256 * 1024 * 1024 });
    fs.writeFileSync(path.join(staging, 'container-inspect.json'), inspectOut);
    const inspect = JSON.parse(inspectOut)?.[0];
    log(`inspected container ${inspect?.Name ?? containerIdOrName}`);

    // snapshot named volumes via a throwaway alpine container mounted read-only-ish
    const mounts = inspect?.Mounts ?? [];
    let volIdx = 0;
    for (const m of mounts) {
      if (m.Type !== 'volume') continue;
      const volName = m.Name as string;
      const dest = path.join(staging, 'volumes', `${volName}.tar.gz`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      log(`snapshotting volume ${volName}`);
      try {
        await exec('docker', ['run', '--rm', '-v', `${volName}:/data:ro`, '-v', `${staging}/volumes:/out`, 'alpine:3.20',
          'sh', '-c', `tar czf /out/${volName}.tar.gz -C /data .`], { maxBuffer: 1024 * 1024 * 1024 });
        volIdx++;
      } catch (e: any) {
        log(`! volume ${volName} skipped: ${e.message}`);
      }
    }
    log(`snapshotted ${volIdx} volumes`);

    // include compose file if it references this container
    try {
      if (fs.existsSync(COMPOSE_FILE)) {
        const composeStage = path.join(staging, 'compose');
        fs.mkdirSync(composeStage);
        fs.copyFileSync(COMPOSE_FILE, path.join(composeStage, path.basename(COMPOSE_FILE)));
      }
    } catch {}

    fs.writeFileSync(path.join(staging, 'meta.json'), JSON.stringify({ container: containerIdOrName, volumes: mounts.filter((m: any) => m.Type === 'volume').map((m: any) => m.Name) }));
    await exec('tar', ['-czf', outPath, '-C', staging, '.']);
    fs.rmSync(staging, { recursive: true, force: true });
  }

  private async backupCompose(name: string, outPath: string, log: (l: string) => void) {
    const file = name || COMPOSE_FILE;
    if (!fs.existsSync(file)) throw new BadRequestException(`compose file ${file} not found`);
    const staging = fs.mkdtempSync('/tmp/hamyar-backup-');
    fs.copyFileSync(file, path.join(staging, path.basename(file)));
    fs.writeFileSync(path.join(staging, 'meta.json'), JSON.stringify({ composeFile: file }));
    await exec('tar', ['-czf', outPath, '-C', staging, '.']);
    fs.rmSync(staging, { recursive: true, force: true });
    log('compose file archived');
  }

  // ───────────────────────────────────────────────────────────────────
  // RESTORE
  // ───────────────────────────────────────────────────────────────────
  async restore(backupId: string, opts: { overwrite?: boolean } = {}): Promise<RestoreResultDto> {
    const rec = await this.prisma.backupRecord.findUnique({ where: { id: backupId } });
    if (!rec) throw new NotFoundException('Backup not found');
    const lines: string[] = [];
    const log = (l: string) => { lines.push(l); };
    log(`restoring ${rec.targetType}/${rec.targetName} from ${rec.fileName}`);

    const archive = await this.getArchiveBuffer(rec);
    const staging = fs.mkdtempSync('/tmp/hamyar-restore-');
    const archiveFile = path.join(staging, 'backup.tar.gz');
    fs.writeFileSync(archiveFile, archive);
    const extractDir = path.join(staging, 'extracted');
    fs.mkdirSync(extractDir);
    await exec('tar', ['-xzf', archiveFile, '-C', extractDir]);

    if (rec.targetType === 'app') {
      const appTar = path.join(extractDir, 'app', 'app.tar.gz');
      const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name: rec.targetName } });
      const deployPath = cfg?.deployPath || (cfg?.envPath ? path.dirname(cfg.envPath) : null);
      if (!deployPath) throw new BadRequestException('No deployPath to restore into');
      if (fs.existsSync(appTar)) {
        const target = opts.overwrite ? deployPath : path.join(deployPath, `.restore-${Date.now()}`);
        fs.mkdirSync(target, { recursive: true });
        await exec('tar', ['-xzf', appTar, '-C', target]);
        log(`extracted app tree → ${target}`);
      }
      const sql = path.join(extractDir, 'app', 'database.sql');
      if (cfg?.dbType && cfg?.dbName && cfg?.containerName && fs.existsSync(sql)) {
        log('restoring embedded database dump…');
        await this.restoreSql(cfg.dbType, cfg.dbName, cfg.containerName, sql, log);
      }
    } else if (rec.targetType === 'database') {
      const sql = path.join(extractDir, 'database.sql');
      const meta = this.readMeta(extractDir);
      const container = meta?.container ?? rec.targetName.split('::')[0];
      const engine = meta?.engine ?? (rec.targetName.split('::')[1] as any) ?? 'postgres';
      const db = meta?.db ?? rec.targetName.split('::')[2];
      await this.restoreSql(engine, db, container, sql, log);
    } else if (rec.targetType === 'container') {
      log('Restoring container volume snapshots…');
      const volsDir = path.join(extractDir, 'volumes');
      if (fs.existsSync(volsDir)) {
        for (const f of fs.readdirSync(volsDir)) {
          if (!f.endsWith('.tar.gz')) continue;
          const volName = f.replace(/\.tar\.gz$/, '');
          log(`restoring volume ${volName}`);
          await exec('docker', ['volume', 'create', volName]);
          await exec('docker', ['run', '--rm', '-v', `${volName}:/data`, '-v', `${volsDir}:/in:ro`, 'alpine:3.20',
            'sh', '-c', `tar xzf /in/${f} -C /data`], { maxBuffer: 1024 * 1024 * 1024 });
        }
      }
    } else {
      log(`restore not implemented for ${rec.targetType}`);
    }

    fs.rmSync(staging, { recursive: true, force: true });
    return { ok: true, message: 'Restore complete', lines };
  }

  private restoreSql(engine: string, db: string, container: string, sqlFile: string, log: (l: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(sqlFile)) return reject(new BadRequestException('database.sql missing in archive'));

      if (container.startsWith('local-')) {
        const file = engine === 'postgres' ? 'psql' : 'mysql';
        const args = engine === 'postgres'
          ? ['-U', 'postgres', '-d', db]
          : [db];
        log(`${engine} restore → ${db} (Local Host)`);
        const child = execFile(file, args, { maxBuffer: 1024 * 1024 * 1024 });
        const stdin = fs.createReadStream(sqlFile);
        let out = '';
        child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
        child.stderr?.on('data', (d: Buffer) => (out += d.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
          if (out) log(out.trim());
          if (code !== 0) return reject(new Error(`restore exited with code ${code}`));
          resolve();
        });
        stdin.on('error', reject);
        stdin.pipe((child as any).stdin);
        return;
      }

      const args = engine === 'postgres'
        ? ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', db]
        : ['exec', '-i', container, 'sh', '-c', `mysql ${db}`];
      log(`${engine} restore → ${db} (in ${container})`);
      const child = execFile('docker', args, { maxBuffer: 1024 * 1024 * 1024 });
      const stdin = fs.createReadStream(sqlFile);
      let out = '';
      child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (out += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (out) log(out.trim());
        if (code !== 0) return reject(new Error(`restore exited with code ${code}`));
        resolve();
      });
      stdin.on('error', reject);
      stdin.pipe((child as any).stdin);
    });
  }

  private readMeta(dir: string): any {
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { return {}; }
  }

  async getArchiveBuffer(rec: any): Promise<Buffer> {
    if (rec.storage === 's3' && rec.s3Key && rec.strategyId) {
      const strat = await this.prisma.backupStrategy.findUnique({ where: { id: rec.strategyId } });
      if (!strat?.s3ConfigId) throw new BadRequestException('S3 config missing');
      return this.s3.download(strat.s3ConfigId, rec.s3Key);
    }
    if (rec.localPath && fs.existsSync(rec.localPath)) return fs.readFileSync(rec.localPath);
    throw new NotFoundException('Backup archive not found on disk');
  }

  // ───────────────────────────────────────────────────────────────────
  // Listing + download path helpers
  // ───────────────────────────────────────────────────────────────────
  async listForTarget(targetType: BackupTargetType, targetName: string): Promise<BackupRecordDto[]> {
    const records = await this.prisma.backupRecord.findMany({
      where: { targetType, targetName },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return records.map((r) => this.toDto(r));
  }

  async getRecord(id: string) {
    return this.prisma.backupRecord.findUnique({ where: { id } });
  }

  async deleteRecord(id: string): Promise<void> {
    const rec = await this.prisma.backupRecord.findUnique({ where: { id } });
    if (!rec) return;
    if (rec.storage === 's3' && rec.s3Key) {
      const strat = await this.prisma.backupStrategy.findUnique({ where: { id: rec.strategyId ?? '' } }).catch(() => null);
      if (strat?.s3ConfigId) await this.s3.delete(strat.s3ConfigId, rec.s3Key).catch(() => {});
    }
    if (rec.localPath && fs.existsSync(rec.localPath)) fs.unlinkSync(rec.localPath);
    await this.prisma.backupRecord.delete({ where: { id } });
  }

  // ───────────────────────────────────────────────────────────────────
  // Retention + cleanup cron
  // ───────────────────────────────────────────────────────────────────
  async enforceRetention(strategy: any): Promise<void> {
    try {
      const records = await this.prisma.backupRecord.findMany({
        where: { strategyId: strategy.id, status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });
      const surplus = records.slice(strategy.retentionMax);
      for (const r of surplus) await this.deleteRecord(r.id);
    } catch (e: any) {
      this.logger.warn(`retention enforcement failed: ${e?.message}`);
    }
  }

  async cleanupExpiredLocal(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.backupRecord.findMany({
      where: { storage: 'local', expiresAt: { lte: now } },
      take: 500,
    });
    let n = 0;
    for (const r of expired) {
      if (r.localPath && fs.existsSync(r.localPath)) {
        try { fs.unlinkSync(r.localPath); n++; } catch {}
      }
      await this.prisma.backupRecord.update({ where: { id: r.id }, data: { status: 'EXPIRED', localPath: null } }).catch(() => {});
    }
    // also sweep files on disk older than TTL not tracked in DB
    try {
      const ents = fs.readdirSync(BACKUPS_DIR);
      for (const f of ents) {
        const full = path.join(BACKUPS_DIR, f);
        const st = fs.statSync(full);
        if (Date.now() - st.mtimeMs > LOCAL_TTL_HOURS * 3600 * 1000) {
          fs.unlinkSync(full);
          n++;
        }
      }
    } catch {}
    if (n > 0) this.logger.log(`cleanup expired local backups: ${n}`);
    return n;
  }

  // ───────────────────────────────────────────────────────────────────
  // Strategy-driven execution (invoked by the scheduler)
  // ───────────────────────────────────────────────────────────────────
  async runStrategyBackup(strategyId: string): Promise<void> {
    const strat = await this.prisma.backupStrategy.findUnique({ where: { id: strategyId } });
    if (!strat || !strat.enabled) return;
    const targets = strat.targets ?? [];
    for (const t of targets) {
      const record = await this.prisma.backupRecord.create({
        data: {
          strategyId,
          targetType: strat.targetType as BackupTargetType,
          targetName: t,
          storage: strat.storage,
          fileName: '',
          status: 'RUNNING',
        },
      });
      await this.executeBackup(record.id, strat.targetType as BackupTargetType, t, strategyId).catch((e) =>
        this.logger.error(`strategy backup failed: ${e?.message}`),
      );
    }
    await this.prisma.backupStrategy.update({ where: { id: strategyId }, data: { lastRanAt: new Date() } });
  }

  async runFullBackup(opts: {
    name?: string;
    includeApps: boolean;
    includeDatabases: boolean;
    includeSshKeys: boolean;
    includeEnvVars: boolean;
    includeDockerConfigs: boolean;
    storage: 'local' | 's3';
    s3ConfigId?: string;
  }): Promise<{ recordId: string; status: string; message: string }> {
    const record = await this.prisma.backupRecord.create({
      data: {
        targetType: 'full',
        targetName: 'full-ops-backup',
        storage: opts.storage,
        fileName: '',
        status: 'RUNNING',
      },
    });

    this.executeFullBackup(record.id, opts).catch((e) =>
      this.logger.error(`full backup failed: ${e?.message}`),
    );

    return { recordId: record.id, status: 'RUNNING', message: 'Full backup started' };
  }

  private async executeFullBackup(
    recordId: string,
    opts: {
      name?: string;
      includeApps: boolean;
      includeDatabases: boolean;
      includeSshKeys: boolean;
      includeEnvVars: boolean;
      includeDockerConfigs: boolean;
      storage: 'local' | 's3';
      s3ConfigId?: string;
    },
  ): Promise<void> {
    const emit = (line: string, stream: 'stdout' | 'stderr' = 'stdout') =>
      this.eventBus.emit(WsEvents.BACKUP_LOG, { recordId, targetType: 'full', targetName: 'full-ops-backup', line, stream });

    this.eventBus.emit(WsEvents.BACKUP_START, { recordId, targetType: 'full', targetName: 'full-ops-backup' });
    const lines: string[] = [];
    const log = (l: string) => { lines.push(l); emit(l); };

    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = (opts.name || 'full-backup').replace(/[^a-zA-Z0-9_.-]/g, '_');
      const fileName = `full-ops-${safeName}-${stamp}.tar.gz`;
      const outPath = path.join(BACKUPS_DIR, fileName);
      log(`→ Full backup destination: ${outPath}`);

      const staging = fs.mkdtempSync('/tmp/hamyar-full-backup-');
      const backupDataDir = path.join(staging, 'backup-data');
      fs.mkdirSync(backupDataDir, { recursive: true });

      const metadata: any = {
        createdAt: new Date().toISOString(),
        version: '1.0.0',
        includedApps: [] as string[],
        includedDatabases: [] as string[],
        includedConfigs: [] as string[],
        sshKeys: opts.includeSshKeys,
        environmentVariables: opts.includeEnvVars,
        dockerConfigs: opts.includeDockerConfigs,
      };

      if (opts.includeApps) {
        const apps = await this.prisma.appConfig.findMany();
        const appBackupDir = path.join(backupDataDir, 'apps');
        fs.mkdirSync(appBackupDir, { recursive: true });
        log(`→ Backing up ${apps.length} application(s)`);

        for (const app of apps) {
          const appDir = path.join(appBackupDir, app.pm2Name);
          fs.mkdirSync(appDir, { recursive: true });

          const appData: any = {
            name: app.name,
            pm2Name: app.pm2Name,
            envPath: app.envPath,
            deployPath: app.deployPath,
            deployCmd: app.deployCmd,
            repoUrl: app.repoUrl,
            branch: app.branch,
            healthUrl: app.healthUrl,
            domain: app.domain,
            containerName: app.containerName,
            dbType: app.dbType,
            dbName: app.dbName,
          };
          metadata.includedApps.push(app.pm2Name);

          if (app.envPath && fs.existsSync(app.envPath)) {
            try {
              fs.copyFileSync(app.envPath, path.join(appDir, '.env'));
              log(`  → copied env for ${app.pm2Name}`);
            } catch {}
          }

          if (app.deployPath && fs.existsSync(app.deployPath)) {
            try {
              const excludeArgs = EXCLUDES.flatMap((e) => ['--exclude', e]);
              await exec('tar', ['-czf', path.join(appDir, 'app.tar.gz'), '-C', app.deployPath, ...excludeArgs, '.']);
              log(`  → archived ${app.pm2Name} app tree`);
            } catch (e: any) {
              log(`  ! failed to archive ${app.pm2Name}: ${e.message}`);
            }
          }

          fs.writeFileSync(path.join(appDir, 'app-config.json'), JSON.stringify(appData, null, 2));
        }
        metadata.includedConfigs.push('appConfigs');
      }

      if (opts.includeDatabases) {
        const containers = await this.dockerService.listContainers();
        const dbContainers = containers.filter(c => {
          const img = c.image.toLowerCase();
          return img.includes('postgres') || img.includes('mysql') || img.includes('mariadb');
        });

        const dbBackupDir = path.join(backupDataDir, 'databases');
        fs.mkdirSync(dbBackupDir, { recursive: true });
        log(`→ Backing up ${dbContainers.length} database container(s)`);

        for (const container of dbContainers) {
          const img = container.image.toLowerCase();
          const engine: 'postgres' | 'mysql' = img.includes('postgres') ? 'postgres' : 'mysql';
          const containerDir = path.join(dbBackupDir, container.name);
          fs.mkdirSync(containerDir, { recursive: true });

          let databases: string[] = [];
          try {
            if (engine === 'postgres') {
              const { stdout } = await exec('docker', ['exec', container.name, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-c', 'SELECT datname FROM pg_database WHERE datistemplate = false;'], { maxBuffer: 1024 * 1024 });
              databases = stdout.trim().split('\n').map(d => d.trim()).filter(Boolean);
            } else {
              const { stdout } = await exec('docker', ['exec', container.name, 'sh', '-c', 'mysql -u root -e "SHOW DATABASES;"'], { maxBuffer: 1024 * 1024 });
              databases = stdout.trim().split('\n').filter(d => d.trim() && d.trim() !== 'Database').map(d => d.trim());
            }
          } catch (e: any) {
            log(`  ! failed to list databases in ${container.name}: ${e.message}`);
          }

          for (const db of databases) {
            if (db === 'postgres' && engine === 'postgres') continue;
            metadata.includedDatabases.push(`${container.name}::${engine}::${db}`);
            log(`  → dumping ${db} from ${container.name}`);

            try {
              const dumpFile = path.join(containerDir, `${db}.sql`);
              if (engine === 'postgres') {
                const { stdout } = await exec('docker', ['exec', container.name, 'pg_dump', '-U', 'postgres', '--no-owner', '--clean', '--if-exists', db], { maxBuffer: 1024 * 1024 * 1024 });
                fs.writeFileSync(dumpFile, stdout);
              } else {
                const { stdout } = await exec('docker', ['exec', container.name, 'sh', '-c', `mysqldump -u root ${db}`], { maxBuffer: 1024 * 1024 * 1024 });
                fs.writeFileSync(dumpFile, stdout);
              }
              log(`    → dumped ${db} (${this.fmtSize(fs.statSync(dumpFile).size)})`);
            } catch (e: any) {
              log(`    ! failed to dump ${db}: ${e.message}`);
            }
          }
        }
        metadata.includedConfigs.push('databases');
      }

      if (opts.includeSshKeys) {
        const sshBackupDir = path.join(backupDataDir, 'ssh');
        fs.mkdirSync(sshBackupDir, { recursive: true });
        log('→ Backing up SSH keys');

        const sshDirs = ['/root/.ssh', '/home/*/.ssh'];
        for (const sshDir of sshDirs) {
          try {
            const expandedDir = sshDir.replace('*', 'root');
            if (fs.existsSync(expandedDir)) {
              const keys = fs.readdirSync(expandedDir).filter(f => f.endsWith('.pub') || f === 'authorized_keys');
              for (const key of keys) {
                fs.copyFileSync(path.join(expandedDir, key), path.join(sshBackupDir, key));
              }
              log(`  → copied keys from ${expandedDir}`);
            }
          } catch {}
        }
        metadata.includedConfigs.push('sshKeys');
      }

      if (opts.includeEnvVars) {
        const envBackupDir = path.join(backupDataDir, 'env');
        fs.mkdirSync(envBackupDir, { recursive: true });
        log('→ Backing up environment variables');

        try {
          const envVars = ['HAMYAR_API_KEY', 'HAMYAR_JWT_SECRET', 'HAMYAR_DB_URL', 'HAMYAR_REDIS_URL', 'HAMYAR_S3_*'];
          for (const envVar of envVars) {
            const pattern = envVar.replace('*', '.*');
            const regex = new RegExp(pattern.replace('*', '.*'));
            for (const key of Object.keys(process.env)) {
              if (regex.test(key)) {
                fs.writeFileSync(path.join(envBackupDir, `${key}.env`), `${key}=${process.env[key] || ''}`);
                log(`  → copied ${key}`);
              }
            }
          }
        } catch {}
        metadata.includedConfigs.push('environmentVariables');
      }

      if (opts.includeDockerConfigs) {
        const dockerBackupDir = path.join(backupDataDir, 'docker');
        fs.mkdirSync(dockerBackupDir, { recursive: true });
        log('→ Backing up Docker configurations');

        const dockerFiles = [
          '/opt/hamyar/backend/docker-compose.yml',
          '/etc/docker/daemon.json',
        ];

        for (const file of dockerFiles) {
          if (fs.existsSync(file)) {
            try {
              fs.copyFileSync(file, path.join(dockerBackupDir, path.basename(file)));
              log(`  → copied ${file}`);
            } catch {}
          }
        }

        try {
          const { stdout } = await exec('docker', ['context', 'ls', '--format', '{{.Name}}']);
          fs.writeFileSync(path.join(dockerBackupDir, 'docker-contexts.txt'), stdout);
        } catch {}

        metadata.includedConfigs.push('dockerConfigs');
      }

      fs.writeFileSync(path.join(staging, 'meta.json'), JSON.stringify(metadata, null, 2));

      await exec('tar', ['-czf', outPath, '-C', staging, '.']);
      fs.rmSync(staging, { recursive: true, force: true });

      const stat = fs.statSync(outPath);
      const sizeBytes = stat.size;

      let storage: 'local' | 's3' = opts.storage;
      let s3Key: string | null = null;
      let localPath: string | null = outPath;
      let expiresAt: Date | null = new Date(Date.now() + LOCAL_TTL_HOURS * 3600 * 1000);

      if (opts.storage === 's3' && opts.s3ConfigId) {
        s3Key = `backups/full/${fileName}`;
        log(`→ uploading to S3: ${s3Key}`);
        const buf = fs.readFileSync(outPath);
        await this.s3.upload(opts.s3ConfigId, s3Key, buf);
        storage = 's3';
        fs.unlinkSync(outPath);
        localPath = null;
        expiresAt = null;
        log(`✓ uploaded to S3 (${this.fmtSize(sizeBytes)})`);
      } else {
        log(`✓ full backup created locally (${this.fmtSize(sizeBytes)})`);
      }

      await this.prisma.backupRecord.update({
        where: { id: recordId },
        data: {
          storage,
          sizeBytes: BigInt(sizeBytes),
          fileName,
          localPath,
          s3Key,
          status: 'SUCCESS',
          expiresAt: expiresAt ? expiresAt : null,
        },
      });

      this.eventBus.emit(WsEvents.BACKUP_DONE, { recordId, targetType: 'full', targetName: 'full-ops-backup', status: 'SUCCESS' });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      log(`✗ full backup failed: ${msg}`);
      await this.prisma.backupRecord.update({
        where: { id: recordId },
        data: { status: 'FAILED', message: msg },
      }).catch(() => {});
      this.eventBus.emit(WsEvents.BACKUP_DONE, { recordId, targetType: 'full', targetName: 'full-ops-backup', status: 'FAILED', message: msg });
    }
  }

  async restoreFullBackup(backupId: string, opts: { overwrite?: boolean; targetPath?: string } = {}): Promise<RestoreResultDto> {
    const rec = await this.prisma.backupRecord.findUnique({ where: { id: backupId } });
    if (!rec) throw new NotFoundException('Backup not found');
    if (rec.targetType !== 'full') throw new BadRequestException('Not a full backup');

    const lines: string[] = [];
    const log = (l: string) => { lines.push(l); };
    log(`Starting full restore from backup ${rec.fileName}`);

    const archive = await this.getArchiveBuffer(rec);
    const staging = fs.mkdtempSync('/tmp/hamyar-full-restore-');
    const archiveFile = path.join(staging, 'backup.tar.gz');
    fs.writeFileSync(archiveFile, archive);
    await exec('tar', ['-xzf', archiveFile, '-C', staging]);

    const metaFile = path.join(staging, 'meta.json');
    if (!fs.existsSync(metaFile)) throw new BadRequestException('Invalid backup: meta.json missing');
    const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

    const backupDataDir = path.join(staging, 'backup-data');

    if (fs.existsSync(path.join(backupDataDir, 'apps'))) {
      log('Restoring applications...');
      const appsDir = path.join(backupDataDir, 'apps');
      if (fs.existsSync(appsDir)) {
        for (const appDir of fs.readdirSync(appsDir)) {
          const configFile = path.join(appsDir, appDir, 'app-config.json');
          if (!fs.existsSync(configFile)) continue;

          const appConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
          log(`  → Restoring app: ${appConfig.pm2Name}`);

          const existing = await this.prisma.appConfig.findUnique({ where: { pm2Name: appConfig.pm2Name } });
          if (existing) {
            await this.prisma.appConfig.update({
              where: { pm2Name: appConfig.pm2Name },
              data: {
                envPath: appConfig.envPath,
                deployPath: appConfig.deployPath,
                deployCmd: appConfig.deployCmd,
                repoUrl: appConfig.repoUrl,
                branch: appConfig.branch,
                healthUrl: appConfig.healthUrl,
                domain: appConfig.domain,
                containerName: appConfig.containerName,
                dbType: appConfig.dbType,
                dbName: appConfig.dbName,
              },
            });
          } else {
            await this.prisma.appConfig.create({
              data: {
                name: appConfig.name,
                pm2Name: appConfig.pm2Name,
                envPath: appConfig.envPath,
                deployPath: appConfig.deployPath,
                deployCmd: appConfig.deployCmd,
                repoUrl: appConfig.repoUrl,
                branch: appConfig.branch || 'main',
                healthUrl: appConfig.healthUrl,
                domain: appConfig.domain,
                containerName: appConfig.containerName,
                dbType: appConfig.dbType,
                dbName: appConfig.dbName,
              },
            });
          }

          const appTar = path.join(appsDir, appDir, 'app.tar.gz');
          if (fs.existsSync(appTar) && appConfig.deployPath) {
            const target = opts.overwrite ? appConfig.deployPath : path.join(appConfig.deployPath, `.restore-${Date.now()}`);
            fs.mkdirSync(target, { recursive: true });
            await exec('tar', ['-xzf', appTar, '-C', target]);
            log(`    → extracted to ${target}`);
          }

          const envFile = path.join(appsDir, appDir, '.env');
          if (fs.existsSync(envFile) && appConfig.envPath) {
            fs.copyFileSync(envFile, appConfig.envPath);
            log(`    → restored env file`);
          }
        }
      }
    }

    if (fs.existsSync(path.join(backupDataDir, 'databases'))) {
      log('Restoring databases...');
      const dbDir = path.join(backupDataDir, 'databases');
      if (fs.existsSync(dbDir)) {
        for (const containerDir of fs.readdirSync(dbDir)) {
          const containerPath = path.join(dbDir, containerDir);
          if (!fs.statSync(containerPath).isDirectory()) continue;

          for (const dbFile of fs.readdirSync(containerPath)) {
            if (!dbFile.endsWith('.sql')) continue;
            const dbName = dbFile.replace('.sql', '');
            log(`  → Restoring database ${dbName} in ${containerDir}`);

            try {
              const engine = metadata.includedDatabases.find((d: string) => d.includes(containerDir) && d.includes(dbName))?.split('::')[1] || 'postgres';
              if (engine === 'postgres') {
                await exec('docker', ['exec', '-i', containerDir, 'psql', '-U', 'postgres', '-d', dbName], { maxBuffer: 1024 * 1024 * 1024 });
              } else {
                await exec('docker', ['exec', '-i', containerDir, 'sh', '-c', `mysql ${dbName}`], { maxBuffer: 1024 * 1024 * 1024 });
              }
            } catch (e: any) {
              log(`    ! restore note: ${e.message}`);
            }
          }
        }
      }
    }

    if (fs.existsSync(path.join(backupDataDir, 'ssh'))) {
      log('Restoring SSH keys...');
      const sshDir = path.join(backupDataDir, 'ssh');
      const targetSshDir = '/root/.ssh';
      fs.mkdirSync(targetSshDir, { recursive: true });

      for (const keyFile of fs.readdirSync(sshDir)) {
        fs.copyFileSync(path.join(sshDir, keyFile), path.join(targetSshDir, keyFile));
        log(`  → restored ${keyFile}`);
      }
    }

    if (fs.existsSync(path.join(backupDataDir, 'docker'))) {
      log('Restoring Docker configurations...');
      const dockerDir = path.join(backupDataDir, 'docker');

      const composeFile = path.join(dockerDir, 'docker-compose.yml');
      if (fs.existsSync(composeFile)) {
        const targetCompose = '/opt/hamyar/backend/docker-compose.yml';
        fs.mkdirSync(path.dirname(targetCompose), { recursive: true });
        fs.copyFileSync(composeFile, targetCompose);
        log(`  → restored docker-compose.yml`);
      }
    }

    fs.rmSync(staging, { recursive: true, force: true });
    log('Full restore complete');
    return { ok: true, message: 'Full restore completed successfully', lines };
  }

  async listFullBackups(): Promise<any[]> {
    const records = await this.prisma.backupRecord.findMany({
      where: { targetType: 'full' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return records.map((r) => {
      let metadata: any = {};
      try {
        if (r.localPath && fs.existsSync(r.localPath)) {
          const staging = fs.mkdtempSync('/tmp/hamyar-read-meta-');
          exec('tar', ['-xzf', r.localPath, '-C', staging]);
          const metaFile = path.join(staging, 'meta.json');
          if (fs.existsSync(metaFile)) {
            metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
          }
          fs.rmSync(staging, { recursive: true, force: true });
        }
      } catch {}

      return {
        id: r.id,
        name: r.fileName.replace('full-ops-', '').replace('.tar.gz', ''),
        sizeBytes: Number(r.sizeBytes),
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt?.toISOString() ?? null,
        includedApps: metadata.includedApps || [],
        includedDatabases: metadata.includedDatabases || [],
        includedConfigs: metadata.includedConfigs || [],
        sshKeys: metadata.sshKeys || false,
        environmentVariables: metadata.environmentVariables || false,
        dockerConfigs: metadata.dockerConfigs || false,
        status: r.status,
        storage: r.storage,
      };
    });
  }

  private fmtSize(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }

  private toDto(r: any): BackupRecordDto {
    return {
      id: r.id,
      strategyId: r.strategyId,
      targetType: r.targetType as BackupTargetType,
      targetName: r.targetName,
      storage: r.storage as 'local' | 's3',
      sizeBytes: Number(r.sizeBytes),
      fileName: r.fileName,
      localPath: r.localPath,
      s3Key: r.s3Key,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
    };
  }
}
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PM2Service } from '../pm2/pm2.service';
import { DockerService } from '../docker/docker.service';
import { DeployService } from './deploy.service';
import { AppConfigDto, AppVersionDto, CreateAppConfigDto, UpdateAppConfigDto, AppTerminalInfoDto } from '@hamyar-ops/shared';
import * as crypto from 'crypto';
import * as path from 'path';
import { Readable } from 'stream';
import { spawn } from 'child_process';

@Injectable()
export class ApplicationsService implements OnModuleInit {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private prisma: PrismaService,
    private pm2: PM2Service,
    private docker: DockerService,
    private deployService: DeployService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultApps();
  }

  private async seedDefaultApps() {
    const defaults = [
      { name: 'Hamyar Backend', pm2Name: 'hamyar-backend', domain: 'api.hamyar.app', healthUrl: 'https://api.hamyar.app/v1/health/live', envPath: '/opt/hamyar/backend/.env', deployPath: '/opt/hamyar/backend', dbType: 'postgres', dbName: 'hamyar', containerName: 'postgres' },
      { name: 'Hamyar Panel', pm2Name: 'hamyar-panel', domain: 'panel.hamyar.app', healthUrl: 'https://panel.hamyar.app/api/health', envPath: '/opt/hamyar/panel/.env', deployPath: '/opt/hamyar/panel' },
      { name: 'Hamyar Main', pm2Name: 'hamyar-main', domain: 'hamyar.app', healthUrl: 'https://hamyar.app/api/health', envPath: '/opt/hamyar/main/.env', deployPath: '/opt/hamyar/main' },
      { name: 'Ops API', pm2Name: 'hamyar-ops-api', domain: 'ops.hamyar.app', healthUrl: 'https://ops.hamyar.app/api/monitoring/health', envPath: '/opt/hamyar/ops/api/.env', deployPath: '/opt/hamyar/ops/api' },
      { name: 'Ops UI', pm2Name: 'hamyar-ops-ui', domain: 'ops.hamyar.app', healthUrl: 'https://ops.hamyar.app/api/health', envPath: '/opt/hamyar/ops/web/apps/web/.env', deployPath: '/opt/hamyar/ops/web' },
    ];

    for (const app of defaults) {
      await this.prisma.appConfig.upsert({
        where: { pm2Name: app.pm2Name },
        update: {},
        create: {
          ...app,
          webhookSecret: crypto.randomBytes(24).toString('hex'),
        },
      });
    }
  }

  async findAll(): Promise<(AppConfigDto & { pm2Status?: string; currentVersion?: AppVersionDto })[]> {
    const configs = await this.prisma.appConfig.findMany({
      orderBy: { name: 'asc' },
    });

    let pm2List: { name: string; status: string }[] = [];
    try {
      pm2List = await this.pm2.list();
    } catch {}

    const pm2Map = new Map(pm2List.map((p) => [p.name, p.status]));

    return Promise.all(
      configs.map(async (cfg) => {
        const latest = await this.prisma.appVersion.findFirst({
          where: { appName: cfg.pm2Name, status: 'SUCCESS' },
          orderBy: { startedAt: 'desc' },
        });

        return {
          ...this.toDto(cfg),
          pm2Status: pm2Map.get(cfg.pm2Name) ?? 'unknown',
          currentVersion: latest ? this.toVersionDto(latest) : undefined,
        };
      }),
    );
  }

  async findOne(pm2Name: string): Promise<AppConfigDto> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    return this.toDto(cfg);
  }

  async create(dto: CreateAppConfigDto): Promise<AppConfigDto> {
    const cfg = await this.prisma.appConfig.create({
      data: {
        ...dto,
        webhookSecret: crypto.randomBytes(24).toString('hex'),
      },
    });
    return this.toDto(cfg);
  }

  async update(id: string, dto: UpdateAppConfigDto): Promise<AppConfigDto> {
    const cfg = await this.prisma.appConfig.update({ where: { id }, data: dto });
    return this.toDto(cfg);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.appConfig.delete({ where: { id } });
  }

  async getVersions(pm2Name: string, page = 1, limit = 20): Promise<{ data: AppVersionDto[]; total: number }> {
    const where = { appName: pm2Name };
    const [data, total] = await Promise.all([
      this.prisma.appVersion.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appVersion.count({ where }),
    ]);
    return { data: data.map(this.toVersionDto), total };
  }

  async triggerDeploy(pm2Name: string, triggeredBy: string): Promise<AppVersionDto> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    if (!cfg.deployCmd) throw new BadRequestException('No deploy command configured for this app');

    const version = await this.prisma.appVersion.create({
      data: {
        appName: pm2Name,
        status: 'PENDING',
        deployedBy: triggeredBy,
      },
    });

    this.deployService.runDeploy(version.id, pm2Name, cfg.deployCmd, triggeredBy, cfg.serverId).then(async (status) => {
      if (status === 'FAILED') {
        // Auto-rollback to the latest successful version
        const lastSuccess = await this.prisma.appVersion.findFirst({
          where: { appName: pm2Name, status: 'SUCCESS' },
          orderBy: { startedAt: 'desc' },
        });
        if (lastSuccess) {
          try {
            await this.triggerRollback(pm2Name, lastSuccess.id, 'System (Auto-Rollback)');
          } catch (err) {
            console.error(`Auto-rollback failed for ${pm2Name}`, err);
          }
        }
      }
    }).catch(() => {});

    return this.toVersionDto(version);
  }

  async triggerRollback(pm2Name: string, versionId: string, triggeredBy: string): Promise<AppVersionDto> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);

    const targetVersion = await this.prisma.appVersion.findFirst({
      where: { id: versionId, appName: pm2Name, status: 'SUCCESS' },
    });
    if (!targetVersion) throw new NotFoundException('Version not found or was not successful');

    const rollbackCmd = targetVersion.commitHash
      ? `${cfg.deployCmd} --ref=${targetVersion.commitHash}`
      : cfg.deployCmd;

    if (!rollbackCmd) throw new BadRequestException('No deploy command configured');

    const version = await this.prisma.appVersion.create({
      data: {
        appName: pm2Name,
        tag: `rollback-to-${targetVersion.tag ?? targetVersion.id.slice(0, 8)}`,
        commitHash: targetVersion.commitHash,
        status: 'PENDING',
        deployedBy: triggeredBy,
      },
    });

    await this.prisma.appVersion.update({
      where: { id: versionId },
      data: { status: 'ROLLED_BACK' },
    });

    this.deployService.runDeploy(version.id, pm2Name, rollbackCmd, triggeredBy, cfg.serverId).catch(() => {});

    return this.toVersionDto(version);
  }

  async downloadVersionStream(pm2Name: string, versionId: string): Promise<Readable> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg || !cfg.deployPath) throw new NotFoundException(`App ${pm2Name} or deployPath not found`);

    const version = await this.prisma.appVersion.findFirst({
      where: { id: versionId, appName: pm2Name },
    });
    if (!version || !version.commitHash) {
      throw new BadRequestException('Version not found or has no commit hash');
    }

    const child = spawn('git', ['archive', '--format=zip', version.commitHash], { cwd: cfg.deployPath });
    
    child.stderr.on('data', (d) => this.logger.error(`Git archive error: ${d}`));

    return child.stdout;
  }

  async handleWebhook(pm2Name: string, secret: string, body: {
    tag?: string;
    commitHash?: string;
    commitMsg?: string;
    ref?: string;
  }): Promise<AppVersionDto> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    if (!cfg.webhookSecret || cfg.webhookSecret !== secret) {
      throw new BadRequestException('Invalid webhook secret');
    }

    const version = await this.prisma.appVersion.create({
      data: {
        appName: pm2Name,
        tag: body.tag ?? null,
        commitHash: body.commitHash ?? null,
        commitMsg: body.commitMsg ?? null,
        deployedBy: 'webhook',
        status: 'SUCCESS',
        finishedAt: new Date(),
      },
    });

    return this.toVersionDto(version);
  }

  /**
   * Record a deployment that was performed by an external CI pipeline
   * (e.g. GitHub Actions). Authenticated via a shared `DEPLOY_RECORD_TOKEN`
   * so the workflow doesn't need per-app webhook secrets.
   */
  async recordCIDeploy(
    pm2Name: string,
    token: string,
    body: { tag?: string; commitHash?: string; commitMsg?: string; ref?: string; deployedBy?: string; status?: string },
  ): Promise<AppVersionDto> {
    const expected = process.env.DEPLOY_RECORD_TOKEN;
    if (!expected || expected === 'change-me-ops-deploy-token') {
      throw new UnauthorizedException('Deploy recording is not configured on the server');
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid deploy token');
    }

    const cfg = await this.prisma.appConfig.findFirst({
      where: {
        OR: [
          { pm2Name },
          { name: pm2Name },
        ],
      },
    });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);

    const version = await this.prisma.appVersion.create({
      data: {
        appName: cfg.pm2Name,
        tag: body.tag ?? body.ref ?? null,
        commitHash: body.commitHash ?? null,
        commitMsg: body.commitMsg ?? null,
        deployedBy: body.deployedBy ?? 'github-actions',
        status: (body.status as any) ?? 'SUCCESS',
        finishedAt: new Date(),
      },
    });

    return this.toVersionDto(version);
  }

  async getWebhookSecret(pm2Name: string): Promise<{ webhookSecret: string; webhookUrl: string }> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    return {
      webhookSecret: cfg.webhookSecret ?? '',
      webhookUrl: `/api/applications/webhook/${pm2Name}`,
    };
  }

  async rotateWebhookSecret(pm2Name: string): Promise<{ webhookSecret: string }> {
    const secret = crypto.randomBytes(24).toString('hex');
    await this.prisma.appConfig.update({
      where: { pm2Name },
      data: { webhookSecret: secret },
    });
    return { webhookSecret: secret };
  }

  async getTerminalInfo(pm2Name: string): Promise<AppTerminalInfoDto> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);

    let kind: AppTerminalInfoDto['kind'] = 'unknown';
    let containerId: string | null = null;
    let command: string | null = null;

    if (cfg.containerName) {
      try {
        const containers = await this.docker.listContainers();
        const c = containers.find((x) => x.name === cfg.containerName || x.id === cfg.containerName);
        kind = 'docker';
        containerId = c?.id ?? cfg.containerName;
        command = c && c.state === 'running' ? `/bin/sh` : null;
      } catch {
        kind = 'docker';
        containerId = cfg.containerName;
      }
    } else {
      try {
        const list = await this.pm2.list();
        const match = list.find((p) => p.name === pm2Name);
        if (match) {
          kind = 'pm2';
          command = 'ssh-shell';
        }
      } catch {}
    }

    const deployPath = cfg.deployPath || (cfg.envPath ? path.dirname(cfg.envPath) : null);

    return {
      pm2Name,
      kind,
      deployPath,
      containerId,
      containerName: cfg.containerName,
      command,
    };
  }

  private toDto(cfg: any): AppConfigDto {
    return {
      id: cfg.id,
      name: cfg.name,
      pm2Name: cfg.pm2Name,
      envPath: cfg.envPath,
      deployPath: cfg.deployPath,
      deployCmd: cfg.deployCmd,
      repoUrl: cfg.repoUrl,
      branch: cfg.branch,
      healthUrl: cfg.healthUrl,
      domain: cfg.domain,
      containerName: cfg.containerName,
      dbType: cfg.dbType,
      dbName: cfg.dbName,
      serverId: cfg.serverId ?? null,
      createdAt: cfg.createdAt.toISOString(),
      updatedAt: cfg.updatedAt.toISOString(),
    };
  }

  private toVersionDto(v: any): AppVersionDto {
    return {
      id: v.id,
      appName: v.appName,
      tag: v.tag,
      commitHash: v.commitHash,
      commitMsg: v.commitMsg,
      deployedBy: v.deployedBy,
      status: v.status,
      startedAt: v.startedAt.toISOString(),
      finishedAt: v.finishedAt?.toISOString() ?? null,
    };
  }
}

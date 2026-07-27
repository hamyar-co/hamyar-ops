import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { EventsService } from '../events/events.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  SupervisorRuleDto,
  CreateSupervisorRuleDto,
  UpdateSupervisorRuleDto,
  SupervisorCheckResultDto,
} from '@hamyar-ops/shared';
import { WsEvents } from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class SupervisorService {
  private readonly logger = new Logger(SupervisorService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: DeployEventBus,
    private eventsService: EventsService,
  ) {}

  async list(serverId?: string): Promise<SupervisorRuleDto[]> {
    const where: any = {};
    if (serverId === 'null' || serverId === '') {
      where.serverId = null;
    } else if (serverId) {
      where.serverId = serverId;
    }

    const rules = await this.prisma.supervisorRule.findMany({
      where,
      orderBy: [{ serverId: 'asc' }, { appName: 'asc' }],
    });

    const serverIds = [...new Set(rules.map((r) => r.serverId).filter(Boolean) as string[])];
    const serverMap = new Map<string, string>();

    if (serverIds.length > 0) {
      const servers = await this.prisma.managedServer.findMany({
        where: { id: { in: serverIds } },
        select: { id: true, name: true },
      });
      servers.forEach((s) => serverMap.set(s.id, s.name));
    }

    return rules.map((r) => this.toDto(r, serverMap));
  }

  async create(dto: CreateSupervisorRuleDto): Promise<SupervisorRuleDto> {
    const rule = await this.prisma.supervisorRule.create({
      data: {
        serverId: dto.serverId ?? null,
        appName: dto.appName,
        appType: dto.appType,
        autoRestart: dto.autoRestart ?? true,
        enabled: dto.enabled ?? true,
      },
    });
    return this.toDto(rule, new Map());
  }

  async update(id: string, dto: UpdateSupervisorRuleDto): Promise<SupervisorRuleDto> {
    const existing = await this.prisma.supervisorRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supervisor rule not found');

    const rule = await this.prisma.supervisorRule.update({
      where: { id },
      data: {
        ...(dto.appName !== undefined && { appName: dto.appName }),
        ...(dto.appType !== undefined && { appType: dto.appType }),
        ...(dto.autoRestart !== undefined && { autoRestart: dto.autoRestart }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    });
    return this.toDto(rule, new Map());
  }

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.supervisorRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supervisor rule not found');
    await this.prisma.supervisorRule.delete({ where: { id } });
  }

  async toggle(id: string): Promise<SupervisorRuleDto> {
    const existing = await this.prisma.supervisorRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supervisor rule not found');

    const rule = await this.prisma.supervisorRule.update({
      where: { id },
      data: { enabled: !existing.enabled },
    });
    return this.toDto(rule, new Map());
  }

  async checkRule(ruleId: string): Promise<SupervisorCheckResultDto> {
    const rule = await this.prisma.supervisorRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Supervisor rule not found');

    const appName = rule.appName;
    const appType = rule.appType as 'PM2' | 'DOCKER' | 'SYSTEMD';
    let status: 'RUNNING' | 'DOWN' | 'RESTARTED' | 'UNKNOWN' = 'UNKNOWN';
    let restarted = false;

    try {
      const checkOutput = await this.runCommand(rule.serverId, this.buildCheckCmd(appType, appName));
      status = this.parseStatus(appType, checkOutput);

      if (status === 'DOWN' && rule.autoRestart) {
        this.logger.warn(`Rule ${ruleId}: ${appName} is DOWN — attempting restart`);
        await this.runCommand(rule.serverId, this.buildRestartCmd(appType, appName));
        status = 'RESTARTED';
        restarted = true;
      }
    } catch (err: any) {
      this.logger.error(`Rule ${ruleId}: check failed — ${err.message}`);
      status = 'UNKNOWN';
    }

    const now = new Date();
    const updatedRule = await this.prisma.supervisorRule.update({
      where: { id: ruleId },
      data: {
        lastCheckAt: now,
        lastStatus: status,
        ...(restarted && { restartCount: { increment: 1 } }),
      },
    });

    // Log event
    const severity = status === 'RUNNING' ? 'INFO' : 'WARNING';
    const title =
      status === 'RUNNING'
        ? `${appName} is running`
        : status === 'RESTARTED'
          ? `${appName} was restarted automatically`
          : `${appName} is DOWN`;

    await this.eventsService.create({
      type: 'SUPERVISOR',
      title,
      description: `App type: ${appType}${rule.serverId ? `, serverId: ${rule.serverId}` : ' (ops server)'}`,
      severity,
      appName,
      serverId: rule.serverId ?? undefined,
    });

    const result: SupervisorCheckResultDto = {
      ruleId,
      appName,
      serverId: rule.serverId,
      status,
      restarted,
      checkedAt: now.toISOString(),
    };

    // Emit WebSocket event
    this.eventBus.emit(WsEvents.SUPERVISOR_STATUS, {
      ...result,
      rule: this.toDto(updatedRule, new Map()),
    });

    return result;
  }

  async checkAll(): Promise<SupervisorCheckResultDto[]> {
    const rules = await this.prisma.supervisorRule.findMany({ where: { enabled: true } });
    const results: SupervisorCheckResultDto[] = [];

    for (const rule of rules) {
      try {
        const result = await this.checkRule(rule.id);
        results.push(result);
      } catch (err: any) {
        this.logger.error(`checkAll: failed for rule ${rule.id} — ${err.message}`);
      }
    }

    return results;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildCheckCmd(appType: 'PM2' | 'DOCKER' | 'SYSTEMD', appName: string): string {
    switch (appType) {
      case 'PM2':
        return `pm2 show ${appName} --no-color 2>&1 | grep -E "status|online"`;
      case 'DOCKER':
        return `docker inspect --format='{{.State.Status}}' ${appName} 2>&1`;
      case 'SYSTEMD':
        return `systemctl is-active ${appName} 2>&1`;
    }
  }

  private buildRestartCmd(appType: 'PM2' | 'DOCKER' | 'SYSTEMD', appName: string): string {
    switch (appType) {
      case 'PM2':
        return `pm2 restart ${appName}`;
      case 'DOCKER':
        return `docker start ${appName}`;
      case 'SYSTEMD':
        return `systemctl start ${appName}`;
    }
  }

  private parseStatus(appType: 'PM2' | 'DOCKER' | 'SYSTEMD', output: string): 'RUNNING' | 'DOWN' {
    const out = output.toLowerCase().trim();
    switch (appType) {
      case 'PM2':
        return out.includes('online') ? 'RUNNING' : 'DOWN';
      case 'DOCKER':
        return out === 'running' ? 'RUNNING' : 'DOWN';
      case 'SYSTEMD':
        return out === 'active' ? 'RUNNING' : 'DOWN';
    }
  }

  private async runCommand(serverId: string | null, command: string): Promise<string> {
    if (!serverId) {
      // Local execution on the ops server
      const { stdout } = await execFileAsync('bash', ['-c', command]);
      return stdout;
    }

    // Remote SSH execution
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException(`Managed server ${serverId} not found`);

    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `ssh_key_sup_${Date.now()}`);

    try {
      if (server.sshKeyId) {
        const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
        if (sshKey) {
          fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
        }
      }

      const sshCmd = server.sshKeyId
        ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} "${command.replace(/"/g, '\\"')}"`
        : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 ${server.username}@${server.host} -p ${server.port} "${command.replace(/"/g, '\\"')}"`;

      const { stdout } = await execFileAsync('bash', ['-c', sshCmd]);
      return stdout;
    } finally {
      try {
        if (server.sshKeyId && fs.existsSync(keyFile)) {
          fs.unlinkSync(keyFile);
        }
      } catch {}
    }
  }

  private toDto(rule: any, serverMap: Map<string, string>): SupervisorRuleDto {
    return {
      id: rule.id,
      serverId: rule.serverId,
      serverName: rule.serverId ? (serverMap.get(rule.serverId) ?? null) : null,
      appName: rule.appName,
      appType: rule.appType as 'PM2' | 'DOCKER' | 'SYSTEMD',
      autoRestart: rule.autoRestart,
      enabled: rule.enabled,
      lastCheckAt: rule.lastCheckAt?.toISOString() ?? null,
      lastStatus: rule.lastStatus as SupervisorRuleDto['lastStatus'],
      restartCount: rule.restartCount,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}

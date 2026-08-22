import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  ServerFirewallStatusDto,
  ServerFirewallRuleDto,
  CreateServerFirewallRuleDto,
} from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class ServerFirewallService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  // ─── SSH helper ─────────────────────────────────────────────────────────────

  private async execSsh(
    serverId: string,
    command: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const tempDir = os.tmpdir();
    const keyFile = path.join(
      tempDir,
      `sfwl_key_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    );
    const hasKey = !!server.sshKeyId;

    try {
      if (hasKey) {
        const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId! } });
        if (sshKey) {
          fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
        }
      }

      const sshBase = hasKey
        ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port}`
        : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 ${server.username}@${server.host} -p ${server.port}`;

      const escapedCommand = command.replace(/"/g, '\\"');
      const fullCmd = `${sshBase} "${escapedCommand}"`;

      let stdout = '';
      let stderr = '';

      try {
        const result = await execFileAsync('bash', ['-c', fullCmd]);
        stdout = result.stdout ?? '';
        stderr = result.stderr ?? '';
      } catch (e: any) {
        stdout = e.stdout ?? '';
        stderr = e.stderr ?? e.message ?? '';
      }

      return { stdout, stderr };
    } finally {
      try {
        if (hasKey && fs.existsSync(keyFile)) {
          fs.unlinkSync(keyFile);
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }

  // ─── getStatus ──────────────────────────────────────────────────────────────

  async getStatus(serverId: string): Promise<ServerFirewallStatusDto> {
    const { stdout } = await this.execSsh(serverId, 'sudo ufw status verbose 2>&1');

    const enabled = /Status:\s*active/i.test(stdout);

    const incomingMatch = stdout.match(/Default:\s*(\w+)\s*\(incoming\)/i);
    const defaultIncoming = incomingMatch ? incomingMatch[1] : 'unknown';

    const outgoingMatch = stdout.match(/(\w+)\s*\(outgoing\)/i);
    const defaultOutgoing = outgoingMatch ? outgoingMatch[1] : 'unknown';

    return { serverId, enabled, defaultIncoming, defaultOutgoing };
  }

  // ─── getRules ───────────────────────────────────────────────────────────────

  async getRules(serverId: string): Promise<ServerFirewallRuleDto[]> {
    const { stdout } = await this.execSsh(serverId, 'sudo ufw status numbered 2>&1');

    const rules: ServerFirewallRuleDto[] = [];

    // Matches lines like: [ 1] 22/tcp                     ALLOW IN    Anywhere
    const lineRe = /\[\s*(\d+)\]\s+(\S+)\s+(ALLOW|DENY|LIMIT)\s*(IN|OUT|FWD)?\s*(.*)/gi;
    let match: RegExpExecArray | null;

    while ((match = lineRe.exec(stdout)) !== null) {
      const ruleNum = parseInt(match[1], 10);
      const toRaw = match[2].trim();
      const action = match[3].toUpperCase() as 'ALLOW' | 'DENY' | 'LIMIT';
      const directionRaw = (match[4] ?? 'IN').toUpperCase();
      const fromRaw = match[5].trim();

      // Parse port and protocol from toRaw (e.g. "22/tcp", "80", "Anywhere")
      let to = toRaw;
      let protocol = 'any';
      const protoSplit = toRaw.split('/');
      if (protoSplit.length === 2) {
        to = protoSplit[0];
        protocol = protoSplit[1];
      }

      const direction = ['IN', 'OUT', 'FWD'].includes(directionRaw)
        ? (directionRaw as 'IN' | 'OUT' | 'FWD')
        : 'IN';

      rules.push({
        ruleNum,
        action,
        direction,
        from: fromRaw || 'Anywhere',
        to,
        protocol,
      });
    }

    return rules;
  }

  // ─── addRule ────────────────────────────────────────────────────────────────

  async addRule(serverId: string, dto: CreateServerFirewallRuleDto): Promise<{ stdout: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const dir = dto.direction ?? 'in';
    const from = dto.fromIp ?? 'any';
    const protoSuffix =
      dto.protocol && dto.protocol !== 'any' ? `/${dto.protocol}` : '';

    const cmd = `sudo ufw ${dto.action} ${dir} from ${from} to any port ${dto.port}${protoSuffix} 2>&1`;
    const { stdout } = await this.execSsh(serverId, cmd);

    await this.events.create({
      type: 'FIREWALL',
      title: `Firewall rule added on ${server.name}`,
      description: `${dto.action.toUpperCase()} ${dir.toUpperCase()} from ${from} to port ${dto.port}${protoSuffix}`,
      serverId,
      serverName: server.name,
      severity: 'INFO',
    });

    return { stdout };
  }

  // ─── deleteRule ─────────────────────────────────────────────────────────────

  async deleteRule(serverId: string, ruleNum: number): Promise<{ stdout: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const { stdout } = await this.execSsh(
      serverId,
      `echo 'y' | sudo ufw delete ${ruleNum} 2>&1`,
    );

    await this.events.create({
      type: 'FIREWALL',
      title: `Firewall rule #${ruleNum} deleted on ${server.name}`,
      serverId,
      serverName: server.name,
      severity: 'WARNING',
    });

    return { stdout };
  }

  // ─── enable ─────────────────────────────────────────────────────────────────

  async enable(serverId: string): Promise<{ stdout: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const { stdout } = await this.execSsh(
      serverId,
      `echo 'y' | sudo ufw --force enable 2>&1`,
    );

    await this.events.create({
      type: 'FIREWALL',
      title: `UFW enabled on ${server.name}`,
      serverId,
      serverName: server.name,
      severity: 'SUCCESS',
    });

    return { stdout };
  }

  // ─── disable ────────────────────────────────────────────────────────────────

  async disable(serverId: string): Promise<{ stdout: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const { stdout } = await this.execSsh(serverId, 'sudo ufw disable 2>&1');

    await this.events.create({
      type: 'FIREWALL',
      title: `UFW disabled on ${server.name}`,
      serverId,
      serverName: server.name,
      severity: 'WARNING',
    });

    return { stdout };
  }

  // ─── setDefaults ────────────────────────────────────────────────────────────

  async setDefaults(serverId: string): Promise<{ stdout: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const cmd = [
      'sudo ufw default deny incoming',
      'sudo ufw default allow outgoing',
      'sudo ufw allow 22/tcp',
      'sudo ufw allow 80/tcp',
      'sudo ufw allow 443/tcp',
    ].join(' && ');

    const { stdout } = await this.execSsh(serverId, `${cmd} 2>&1`);

    await this.events.create({
      type: 'FIREWALL',
      title: `UFW defaults applied on ${server.name}`,
      description: 'deny incoming, allow outgoing, allow 22/80/443',
      serverId,
      serverName: server.name,
      severity: 'INFO',
    });

    return { stdout };
  }
}

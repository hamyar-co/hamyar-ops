import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  HostnameDto,
  HostsFileDto,
  HostsEntryDto,
  ResolvConfDto,
  PasswordAuthStatusDto,
} from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class ServerConfigService {
  constructor(private prisma: PrismaService) {}

  // ─── SSH helper ────────────────────────────────────────────────────────────

  private async execSsh(serverId: string, command: string): Promise<string> {
    if (serverId === 'self') {
      const { stdout } = await execFileAsync('bash', ['-c', command]);
      return stdout;
    }

    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `ssh_cfg_key_${Date.now()}_${Math.random().toString(36).slice(2)}`);
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

      const { stdout } = await execFileAsync('bash', ['-c', fullCmd]);
      return stdout;
    } finally {
      try {
        if (hasKey && fs.existsSync(keyFile)) fs.unlinkSync(keyFile);
      } catch { /* ignore */ }
    }
  }

  // ─── Hostname ──────────────────────────────────────────────────────────────

  async getHostname(serverId: string): Promise<HostnameDto> {
    const stdout = await this.execSsh(serverId, 'hostname');
    return { serverId, hostname: stdout.trim() };
  }

  async setHostname(serverId: string, name: string): Promise<HostnameDto> {
    // Validate name to prevent injection
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-\.]*$/.test(name)) {
      throw new BadRequestException('Invalid hostname format');
    }
    const stdout = await this.execSsh(serverId, `sudo hostnamectl set-hostname '${name}' && hostname`);
    return { serverId, hostname: stdout.trim() };
  }

  // ─── /etc/hosts ────────────────────────────────────────────────────────────

  async getHostsFile(serverId: string): Promise<HostsFileDto> {
    const raw = await this.execSsh(serverId, 'cat /etc/hosts');
    const entries: HostsEntryDto[] = [];
    let lineNum = 0;
    for (const line of raw.split('\n')) {
      lineNum++;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Strip inline comment
      const commentMatch = trimmed.match(/^([^#]+)(?:#(.*))?$/);
      if (!commentMatch) continue;
      const parts = commentMatch[1].trim().split(/\s+/);
      const comment = commentMatch[2]?.trim();

      if (parts.length < 2) continue;
      const [ip, hostname, ...aliases] = parts;
      entries.push({ lineNum, ip, hostname, aliases, comment, raw: line });
    }
    return { serverId, entries, raw };
  }

  async updateHostsFile(serverId: string, content: string): Promise<{ success: boolean }> {
    // Base64-encode content to safely transfer over SSH
    const b64 = Buffer.from(content).toString('base64');
    await this.execSsh(
      serverId,
      `echo '${b64}' | base64 -d | sudo tee /etc/hosts > /dev/null && echo ok`,
    );
    return { success: true };
  }

  async addHostsEntry(
    serverId: string,
    ip: string,
    hostname: string,
    aliases?: string[],
    comment?: string,
  ): Promise<{ success: boolean }> {
    const aliasPart = aliases?.length ? ' ' + aliases.join(' ') : '';
    const commentPart = comment ? ` # ${comment}` : '';
    const line = `${ip}\\t${hostname}${aliasPart}${commentPart}`;
    await this.execSsh(serverId, `printf '${line}\\n' | sudo tee -a /etc/hosts > /dev/null && echo ok`);
    return { success: true };
  }

  async removeHostsEntry(serverId: string, lineNum: number): Promise<{ success: boolean }> {
    if (!Number.isInteger(lineNum) || lineNum < 1) {
      throw new BadRequestException('Invalid line number');
    }
    await this.execSsh(serverId, `sudo sed -i '${lineNum}d' /etc/hosts && echo ok`);
    return { success: true };
  }

  // ─── /etc/resolv.conf ──────────────────────────────────────────────────────

  async getResolvConf(serverId: string): Promise<ResolvConfDto> {
    const raw = await this.execSsh(serverId, 'cat /etc/resolv.conf');
    const nameservers: string[] = [];
    const search: string[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('nameserver ')) {
        nameservers.push(trimmed.replace('nameserver ', '').trim());
      } else if (trimmed.startsWith('search ')) {
        search.push(...trimmed.replace('search ', '').trim().split(/\s+/));
      } else if (trimmed.startsWith('domain ')) {
        search.push(trimmed.replace('domain ', '').trim());
      }
    }

    return { serverId, nameservers, search, raw };
  }

  async setNameservers(
    serverId: string,
    nameservers: string[],
    searchDomains: string[] = [],
  ): Promise<{ success: boolean }> {
    const lines: string[] = ['# Generated by hamyar-ops'];
    for (const ns of nameservers) {
      lines.push(`nameserver ${ns}`);
    }
    if (searchDomains.length) {
      lines.push(`search ${searchDomains.join(' ')}`);
    }
    const content = lines.join('\n') + '\n';
    const b64 = Buffer.from(content).toString('base64');
    await this.execSsh(
      serverId,
      `echo '${b64}' | base64 -d | sudo tee /etc/resolv.conf > /dev/null && echo ok`,
    );
    return { success: true };
  }

  // ─── SSH password auth ─────────────────────────────────────────────────────

  async getPasswordAuthStatus(serverId: string): Promise<PasswordAuthStatusDto> {
    const raw = await this.execSsh(
      serverId,
      'grep -E "^#?PasswordAuthentication" /etc/ssh/sshd_config | head -1 || echo ""',
    );
    const rawLine = raw.trim();
    // enabled if line matches `PasswordAuthentication yes` (not commented out)
    const enabled = /^PasswordAuthentication\s+yes/i.test(rawLine);
    return { serverId, enabled, rawLine };
  }

  async setPasswordAuth(serverId: string, enabled: boolean): Promise<{ success: boolean }> {
    const value = enabled ? 'yes' : 'no';
    await this.execSsh(
      serverId,
      `sudo sed -i 's/.*PasswordAuthentication.*/PasswordAuthentication ${value}/' /etc/ssh/sshd_config && sudo systemctl reload sshd && echo ok`,
    );
    return { success: true };
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ManagedServerDto,
  CreateManagedServerDto,
  UpdateManagedServerDto,
  SshKeyDto,
  CreateSshKeyDto,
  RemoteMetricsDto,
  RemoteCommandResult,
  ServerMetricsDto,
} from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class MultiServerService {
  constructor(private prisma: PrismaService) {}

  async listServers(): Promise<ManagedServerDto[]> {
    const servers = await this.prisma.managedServer.findMany({
      include: { sshKey: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return servers.map((s) => ({
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      sshKeyId: s.sshKeyId,
      sshKeyName: s.sshKey?.name ?? null,
      tags: s.tags,
      isActive: s.isActive,
      lastPingAt: s.lastPingAt?.toISOString() ?? null,
      lastPingOk: s.lastPingOk,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  async getServer(id: string): Promise<ManagedServerDto> {
    const s = await this.prisma.managedServer.findUnique({
      where: { id },
      include: { sshKey: { select: { name: true } } },
    });
    if (!s) throw new NotFoundException('Server not found');
    return {
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      sshKeyId: s.sshKeyId,
      sshKeyName: s.sshKey?.name ?? null,
      tags: s.tags,
      isActive: s.isActive,
      lastPingAt: s.lastPingAt?.toISOString() ?? null,
      lastPingOk: s.lastPingOk,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async createServer(dto: CreateManagedServerDto): Promise<ManagedServerDto> {
    const existing = await this.prisma.managedServer.findUnique({ where: { name: dto.name } });
    if (existing) throw new BadRequestException('Server name already exists');

    if (dto.sshKeyId) {
      const key = await this.prisma.sshKey.findUnique({ where: { id: dto.sshKeyId } });
      if (!key) throw new NotFoundException('SSH key not found');
    }

    const s = await this.prisma.managedServer.create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 22,
        username: dto.username,
        sshKeyId: dto.sshKeyId,
        tags: dto.tags ?? [],
      },
      include: { sshKey: { select: { name: true } } },
    });

    return {
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      sshKeyId: s.sshKeyId,
      sshKeyName: s.sshKey?.name ?? null,
      tags: s.tags,
      isActive: s.isActive,
      lastPingAt: s.lastPingAt?.toISOString() ?? null,
      lastPingOk: s.lastPingOk,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async updateServer(id: string, dto: UpdateManagedServerDto): Promise<ManagedServerDto> {
    const existing = await this.prisma.managedServer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Server not found');

    if (dto.name) {
      const duplicate = await this.prisma.managedServer.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (duplicate) throw new BadRequestException('Server name already exists');
    }

    if (dto.sshKeyId) {
      const key = await this.prisma.sshKey.findUnique({ where: { id: dto.sshKeyId } });
      if (!key) throw new NotFoundException('SSH key not found');
    }

    const s = await this.prisma.managedServer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.host !== undefined && { host: dto.host }),
        ...(dto.port !== undefined && { port: dto.port }),
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.sshKeyId !== undefined && { sshKeyId: dto.sshKeyId }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { sshKey: { select: { name: true } } },
    });

    return {
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      sshKeyId: s.sshKeyId,
      sshKeyName: s.sshKey?.name ?? null,
      tags: s.tags,
      isActive: s.isActive,
      lastPingAt: s.lastPingAt?.toISOString() ?? null,
      lastPingOk: s.lastPingOk,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async deleteServer(id: string): Promise<void> {
    const existing = await this.prisma.managedServer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Server not found');
    await this.prisma.managedServer.delete({ where: { id } });
  }

  async pingServer(id: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const start = Date.now();
    try {
      await execFileAsync('ping', ['-c', '1', '-W', '5', server.host]);
      const latencyMs = Date.now() - start;
      await this.prisma.managedServer.update({
        where: { id },
        data: { lastPingAt: new Date(), lastPingOk: true },
      });
      return { success: true, latencyMs };
    } catch (e: any) {
      await this.prisma.managedServer.update({
        where: { id },
        data: { lastPingAt: new Date(), lastPingOk: false },
      });
      return { success: false, error: e.message };
    }
  }

  async pingAllServers(): Promise<void> {
    const servers = await this.prisma.managedServer.findMany({ where: { isActive: true } });
    await Promise.all(servers.map((s) => this.pingServer(s.id)));
  }

  async listSshKeys(): Promise<SshKeyDto[]> {
    const keys = await this.prisma.sshKey.findMany({ orderBy: { name: 'asc' } });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      publicKey: k.publicKey,
      hasPassphrase: !!k.passphrase,
      createdAt: k.createdAt.toISOString(),
      updatedAt: k.updatedAt.toISOString(),
    }));
  }

  async createSshKey(dto: CreateSshKeyDto): Promise<SshKeyDto> {
    const existing = await this.prisma.sshKey.findUnique({ where: { name: dto.name } });
    if (existing) throw new BadRequestException('SSH key name already exists');

    const k = await this.prisma.sshKey.create({
      data: {
        name: dto.name,
        privateKey: dto.privateKey,
        publicKey: dto.publicKey,
        passphrase: dto.passphrase,
      },
    });

    return {
      id: k.id,
      name: k.name,
      publicKey: k.publicKey,
      hasPassphrase: !!k.passphrase,
      createdAt: k.createdAt.toISOString(),
      updatedAt: k.updatedAt.toISOString(),
    };
  }

  async deleteSshKey(id: string): Promise<void> {
    const key = await this.prisma.sshKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('SSH key not found');

    const usedBy = await this.prisma.managedServer.findFirst({ where: { sshKeyId: id } });
    if (usedBy) throw new BadRequestException(`SSH key is used by server: ${usedBy.name}`);

    await this.prisma.sshKey.delete({ where: { id } });
  }

  async getRemoteMetrics(serverId: string): Promise<RemoteMetricsDto> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    try {
      const tempDir = os.tmpdir();
      const keyFile = path.join(tempDir, `ssh_key_${Date.now()}`);
      const script = `
        set -e
        echo '{"cpu":{"percent":0,"cores":1,"model":"remote","speed":0},"memory":{"total":0,"used":0,"free":0,"percent":0},"disk":[],"network":{"rx":0,"tx":0,"rxSec":0,"txSec":0,"interface":"","interfaces":[]},"timestamp":${Date.now()}}'
      `;

      if (server.sshKeyId) {
        const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
        if (sshKey) {
          fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
          fs.chmodSync(keyFile, 0o600);
        }
      }

      const sshCmd = server.sshKeyId
        ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} "${script}"`
        : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${server.username}@${server.host} -p ${server.port} "${script}"`;

      const { stdout } = await execFileAsync('bash', ['-c', sshCmd]);

      if (server.sshKeyId) {
        fs.unlinkSync(keyFile);
      }

      const metrics = JSON.parse(stdout.trim()) as ServerMetricsDto;
      return { serverId, serverName: server.name, reachable: true, metrics };
    } catch (e: any) {
      return { serverId, serverName: server.name, reachable: false, error: e.message };
    }
  }

  async getAllRemoteMetrics(): Promise<RemoteMetricsDto[]> {
    const servers = await this.prisma.managedServer.findMany({ where: { isActive: true } });
    return Promise.all(servers.map((s) => this.getRemoteMetrics(s.id)));
  }

  async executeRemoteCommand(
    serverId: string,
    command: string,
  ): Promise<RemoteCommandResult> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `ssh_key_${Date.now()}`);

    try {
      if (server.sshKeyId) {
        const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
        if (sshKey) {
          fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
        }
      }

      const sshCmd = server.sshKeyId
        ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} "${command.replace(/"/g, '\\"')}"`
        : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${server.username}@${server.host} -p ${server.port} "${command.replace(/"/g, '\\"')}"`;

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      try {
        const result = await execFileAsync('bash', ['-c', sshCmd]);
        stdout = result.stdout || '';
        stderr = result.stderr || '';
      } catch (e: any) {
        stdout = e.stdout || '';
        stderr = e.stderr || e.message || '';
        exitCode = e.exitCode ?? -1;
        return {
          serverId,
          serverName: server.name,
          success: exitCode === 0,
          output: stdout.trim(),
          error: stderr.trim() || undefined,
          exitCode,
        };
      }

      return {
        serverId,
        serverName: server.name,
        success: exitCode === 0,
        output: stdout.trim(),
        error: stderr.trim() || undefined,
        exitCode,
      };
    } finally {
      try {
        if (server.sshKeyId && fs.existsSync(keyFile)) {
          fs.unlinkSync(keyFile);
        }
      } catch {}
    }
  }

  async rebootRemoteServer(serverId: string): Promise<RemoteCommandResult> {
    return this.executeRemoteCommand(serverId, 'sudo shutdown -r now "Reboot requested via hamyar-ops"');
  }

  async shutdownRemoteServer(serverId: string): Promise<RemoteCommandResult> {
    return this.executeRemoteCommand(serverId, 'sudo shutdown -h now "Shutdown requested via hamyar-ops"');
  }
}
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  UserSshKeyDto,
  CreateUserSshKeyDto,
  PushKeyResultDto,
} from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class SshAccessService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  // ─── SSH helper ────────────────────────────────────────────────────────────

  private async execSsh(serverId: string, command: string): Promise<string> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const tempDir = os.tmpdir();
    const keyFile = path.join(
      tempDir,
      `ssh_access_key_${Date.now()}_${Math.random().toString(36).slice(2)}`,
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

      const { stdout } = await execFileAsync('bash', ['-c', fullCmd]);
      return stdout;
    } finally {
      try {
        if (hasKey && fs.existsSync(keyFile)) fs.unlinkSync(keyFile);
      } catch { /* ignore */ }
    }
  }

  // ─── Key fingerprint ────────────────────────────────────────────────────────

  private extractFingerprint(publicKey: string): string {
    // Extract comment portion after the key data (3rd field in "type data comment" format)
    const parts = publicKey.trim().split(/\s+/);
    if (parts.length >= 3) {
      return parts.slice(2).join(' ');
    }
    // Fallback: return first 20 chars of the key data
    return parts[1]?.substring(0, 20) ?? publicKey.substring(0, 20);
  }

  // ─── User key management ───────────────────────────────────────────────────

  async listMyKeys(userId: string): Promise<UserSshKeyDto[]> {
    const keys = await this.prisma.userSshKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => ({
      id: k.id,
      userId: k.userId,
      name: k.name,
      fingerprint: this.extractFingerprint(k.publicKey),
      publicKey: k.publicKey,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  async addKey(userId: string, dto: CreateUserSshKeyDto): Promise<UserSshKeyDto> {
    const k = await this.prisma.userSshKey.create({
      data: {
        userId,
        name: dto.name,
        publicKey: dto.publicKey.trim(),
      },
    });
    return {
      id: k.id,
      userId: k.userId,
      name: k.name,
      fingerprint: this.extractFingerprint(k.publicKey),
      publicKey: k.publicKey,
      createdAt: k.createdAt.toISOString(),
    };
  }

  async deleteKey(userId: string, keyId: string): Promise<void> {
    const key = await this.prisma.userSshKey.findUnique({ where: { id: keyId } });
    if (!key) throw new NotFoundException('SSH key not found');
    if (key.userId !== userId) throw new ForbiddenException('Not your key');
    await this.prisma.userSshKey.delete({ where: { id: keyId } });
  }

  // ─── Server key deployment ─────────────────────────────────────────────────

  async pushKeyToServer(
    userId: string,
    keyId: string,
    serverId: string,
  ): Promise<PushKeyResultDto> {
    const userKey = await this.prisma.userSshKey.findUnique({ where: { id: keyId } });
    if (!userKey) throw new NotFoundException('SSH key not found');
    if (userKey.userId !== userId) throw new ForbiddenException('Not your key');

    // Escape the public key for safe shell use (base64 encode)
    const b64PubKey = Buffer.from(userKey.publicKey.trim()).toString('base64');

    const command = [
      'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
      'touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys',
      // Decode b64 key and append only if not already present
      `PK=$(echo '${b64PubKey}' | base64 -d)`,
      `grep -qF "hamyar-key:${keyId}" ~/.ssh/authorized_keys 2>/dev/null || echo "$PK # hamyar-key:${keyId}" >> ~/.ssh/authorized_keys`,
      'echo ok',
    ].join(' && ');

    try {
      const result = await this.execSsh(serverId, command);
      const success = result.trim().endsWith('ok');

      await this.events.create({
        type: 'ssh-access.key-pushed',
        title: `SSH key "${userKey.name}" pushed to server`,
        serverId,
        userId,
        severity: success ? 'SUCCESS' : 'WARNING',
        metadata: { keyId, keyName: userKey.name },
      });

      return {
        keyId,
        serverId,
        success,
        message: success ? 'Key pushed successfully' : 'Key push may have failed',
      };
    } catch (e: any) {
      return { keyId, serverId, success: false, message: e.message ?? 'SSH error' };
    }
  }

  async removeKeyFromServer(
    userId: string,
    keyId: string,
    serverId: string,
  ): Promise<PushKeyResultDto> {
    const userKey = await this.prisma.userSshKey.findUnique({ where: { id: keyId } });
    if (!userKey) throw new NotFoundException('SSH key not found');
    if (userKey.userId !== userId) throw new ForbiddenException('Not your key');

    try {
      const stdout = await this.execSsh(
        serverId,
        `sed -i '/hamyar-key:${keyId}/d' ~/.ssh/authorized_keys && echo ok`,
      );
      const success = stdout.trim().endsWith('ok');

      await this.events.create({
        type: 'ssh-access.key-removed',
        title: `SSH key "${userKey.name}" removed from server`,
        serverId,
        userId,
        severity: 'INFO',
        metadata: { keyId, keyName: userKey.name },
      });

      return { keyId, serverId, success, message: success ? 'Key removed' : 'Removal may have failed' };
    } catch (e: any) {
      return { keyId, serverId, success: false, message: e.message ?? 'SSH error' };
    }
  }

  async getKeysOnServer(serverId: string): Promise<{ lines: string[]; raw: string }> {
    try {
      const raw = await this.execSsh(
        serverId,
        'cat ~/.ssh/authorized_keys 2>/dev/null || echo ""',
      );
      const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
      return { lines, raw };
    } catch {
      return { lines: [], raw: '' };
    }
  }

  async isKeyOnServer(keyId: string, serverId: string): Promise<{ present: boolean }> {
    const { raw } = await this.getKeysOnServer(serverId);
    return { present: raw.includes(`hamyar-key:${keyId}`) };
  }

  // ─── Password auth (delegated to server config) ────────────────────────────

  async getPasswordAuthStatus(serverId: string) {
    const stdout = await this.execSsh(
      serverId,
      'grep -E "^#?PasswordAuthentication" /etc/ssh/sshd_config | head -1 || echo ""',
    );
    const rawLine = stdout.trim();
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

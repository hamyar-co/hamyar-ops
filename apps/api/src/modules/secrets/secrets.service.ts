import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as bcrypt from 'bcryptjs';

const execFileAsync = promisify(execFile);

export interface VaultStatusDto {
  ansible: {
    configured: boolean;
    passwordSet: boolean;
  };
  hcp: {
    configured: boolean;
    reachable: boolean;
    addr?: string;
    error?: string;
  };
}

export interface EncryptedVarDto {
  key: string;
  encrypted: string;
}

@Injectable()
export class SecretsService {
  constructor(private prisma: PrismaService) {}

  async getVaultStatus(): Promise<VaultStatusDto> {
    const ansibleConfigured = !!process.env.ANSIBLE_VAULT_PASSWORD;

    const passwordSetting = await this.prisma.setting.findUnique({
      where: { key: 'ansible_vault_password_hash' },
    });
    const passwordSet = !!passwordSetting;

    const vaultAddr = process.env.VAULT_ADDR;
    let hcpReachable = false;
    let hcpError: string | undefined;

    if (vaultAddr) {
      try {
        const res = await fetch(`${vaultAddr}/v1/sys/health`, { signal: AbortSignal.timeout(5000) });
        hcpReachable = res.status === 200 || res.status === 429 || res.status === 473;
      } catch (e: any) {
        hcpError = e.message;
      }
    }

    return {
      ansible: {
        configured: ansibleConfigured,
        passwordSet,
      },
      hcp: {
        configured: !!vaultAddr,
        reachable: hcpReachable,
        addr: vaultAddr,
        error: hcpError,
      },
    };
  }

  async encryptAnsibleVar(key: string, value: string, password: string): Promise<EncryptedVarDto> {
    const tempDir = os.tmpdir();
    const passFile = path.join(tempDir, `vault_pass_${Date.now()}`);
    const valueFile = path.join(tempDir, `vault_val_${Date.now()}`);

    try {
      fs.writeFileSync(passFile, password, { mode: 0o600 });
      fs.writeFileSync(valueFile, value, { mode: 0o600 });

      const { stdout } = await execFileAsync('ansible-vault', [
        'encrypt_string',
        '--vault-password-file', passFile,
        value,
        '--name', key,
      ]);

      return { key, encrypted: stdout.trim() };
    } catch (e: any) {
      throw new BadRequestException(`ansible-vault encrypt failed: ${e.stderr ?? e.message}`);
    } finally {
      try { fs.unlinkSync(passFile); } catch {}
      try { fs.unlinkSync(valueFile); } catch {}
    }
  }

  async decryptAnsibleVar(encrypted: string, password: string): Promise<string> {
    const tempDir = os.tmpdir();
    const passFile = path.join(tempDir, `vault_pass_${Date.now()}`);
    const encFile = path.join(tempDir, `vault_enc_${Date.now()}.yml`);

    // Wrap in YAML variable format if it looks like an inline vault string
    const content = encrypted.startsWith('!vault |')
      ? `_var: ${encrypted}`
      : encrypted;

    try {
      fs.writeFileSync(passFile, password, { mode: 0o600 });
      fs.writeFileSync(encFile, content, { mode: 0o600 });

      const { stdout } = await execFileAsync('ansible-vault', [
        'decrypt',
        encFile,
        '--vault-password-file', passFile,
        '--output', '-',
      ]);

      return stdout.trim();
    } catch (e: any) {
      throw new BadRequestException(`ansible-vault decrypt failed: ${e.stderr ?? e.message}`);
    } finally {
      try { fs.unlinkSync(passFile); } catch {}
      try { fs.unlinkSync(encFile); } catch {}
    }
  }

  async setVaultPassword(password: string): Promise<void> {
    if (!password || password.length < 8) {
      throw new BadRequestException('Vault password must be at least 8 characters');
    }
    const hash = await bcrypt.hash(password, 12);
    await this.prisma.setting.upsert({
      where: { key: 'ansible_vault_password_hash' },
      update: { value: hash },
      create: { key: 'ansible_vault_password_hash', value: hash },
    });
  }

  async verifyVaultPassword(password: string): Promise<boolean> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'ansible_vault_password_hash' },
    });
    if (!setting) throw new NotFoundException('No vault password has been set');
    return bcrypt.compare(password, setting.value as string);
  }
}

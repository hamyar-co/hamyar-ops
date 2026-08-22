import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Response } from 'express';
import { isPathInsideRoots } from '../../common/security/path-guard';

const execFileAsync = promisify(execFile);

const ALLOWED_ROOTS = (process.env.FILE_BROWSER_ROOTS || '/etc/nginx,/opt/hamyar,/var/log,/var/www')
  .split(',')
  .map((r) => path.resolve(r.trim()))
  .filter(Boolean);

// Refuse dangerous roots even if misconfigured via env
const FORBIDDEN_ROOTS = new Set(['/', '/etc', '/root', '/home', '/var', '/usr', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys']);

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {
    for (const root of ALLOWED_ROOTS) {
      if (FORBIDDEN_ROOTS.has(root) || root === path.resolve('/')) {
        throw new Error(
          `FILE_BROWSER_ROOTS contains forbidden root "${root}". Use specific directories only.`,
        );
      }
    }
  }

  // ── SSH helper (same pattern as multi-server.service.ts) ──────────────────

  private escapeSsh(p: string): string {
    return p.replace(/'/g, "'\\''");
  }

  private async execSsh(serverId: string, command: string): Promise<string> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `ssh_key_files_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    try {
      if (server.sshKeyId) {
        const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
        if (sshKey) {
          fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
        }
      }

      // Prefer known_hosts verification when available; fall back only if explicitly disabled
      const hostKeyOpt =
        process.env.SSH_STRICT_HOST_KEY === 'false'
          ? 'StrictHostKeyChecking=no'
          : 'StrictHostKeyChecking=accept-new';

      const sshCmd = server.sshKeyId
        ? `ssh -o ${hostKeyOpt} -o ConnectTimeout=15 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} ${JSON.stringify(command)}`
        : `ssh -o ${hostKeyOpt} -o ConnectTimeout=15 ${server.username}@${server.host} -p ${server.port} ${JSON.stringify(command)}`;

      const { stdout } = await execFileAsync('bash', ['-c', sshCmd]);
      return stdout;
    } finally {
      if (server.sshKeyId) {
        try { fs.unlinkSync(keyFile); } catch {}
      }
    }
  }

  // ── Local path validation ─────────────────────────────────────────────────

  private validatePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string' || filePath.includes('\0')) {
      throw new BadRequestException('Invalid path');
    }
    // Block path traversal sequences before resolve
    if (filePath.includes('..')) {
      throw new BadRequestException('Access denied: path traversal not allowed');
    }
    const resolved = isPathInsideRoots(filePath, ALLOWED_ROOTS);
    if (!resolved) {
      throw new BadRequestException('Access denied: path outside allowed directories');
    }
    return resolved;
  }

  // ── listDirectory ─────────────────────────────────────────────────────────

  async listDirectory(dirPath: string, serverId?: string) {
    if (serverId && serverId !== 'self') {
      const escaped = this.escapeSsh(dirPath);
      const output = await this.execSsh(serverId, `ls -la --time-style=+%s '${escaped}' 2>&1`);
      return this.parseLsOutput(output, dirPath);
    }

    const resolved = this.validatePath(dirPath);
    if (!fs.existsSync(resolved)) throw new NotFoundException('Directory not found');

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      path: path.join(resolved, e.name),
      type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
      size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : null,
      modifiedAt: fs.statSync(path.join(resolved, e.name)).mtime.toISOString(),
    }));
  }

  private parseLsOutput(output: string, basePath: string) {
    return output
      .split('\n')
      .filter((line) => line && !line.startsWith('total') && !line.startsWith('ls:'))
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) return null;
        const perms = parts[0];
        const size = parseInt(parts[4], 10) || 0;
        const mtime = parseInt(parts[5], 10) || 0;
        const name = parts.slice(8).join(' ');
        if (name === '.' || name === '..') return null;
        const type = perms.startsWith('d') ? 'directory' : perms.startsWith('-') ? 'file' : 'other';
        return {
          name,
          path: `${basePath.replace(/\/$/, '')}/${name}`,
          type,
          size: type === 'file' ? size : null,
          modifiedAt: mtime ? new Date(mtime * 1000).toISOString() : null,
        };
      })
      .filter(Boolean);
  }

  // ── readFile ──────────────────────────────────────────────────────────────

  async readFile(filePath: string, serverId?: string): Promise<string> {
    if (serverId && serverId !== 'self') {
      const escaped = this.escapeSsh(filePath);
      const output = await this.execSsh(serverId, `cat '${escaped}' 2>&1`);
      return output;
    }

    const resolved = this.validatePath(filePath);
    if (!fs.existsSync(resolved)) throw new NotFoundException('File not found');
    const stat = fs.statSync(resolved);
    if (stat.size > 5 * 1024 * 1024) throw new BadRequestException('File too large (max 5MB)');
    return fs.readFileSync(resolved, 'utf8');
  }

  // ── writeFile ─────────────────────────────────────────────────────────────

  async writeFile(filePath: string, content: string, serverId?: string): Promise<void> {
    if (serverId && serverId !== 'self') {
      const escaped = this.escapeSsh(filePath);
      const b64 = Buffer.from(content, 'utf8').toString('base64');
      await this.execSsh(serverId, `echo '${b64}' | base64 -d > '${escaped}'`);
      return;
    }

    const resolved = this.validatePath(filePath);
    fs.writeFileSync(resolved, content, 'utf8');
  }

  // ── deleteFile ────────────────────────────────────────────────────────────

  async deleteFile(filePath: string, serverId?: string): Promise<void> {
    if (serverId && serverId !== 'self') {
      const escaped = this.escapeSsh(filePath);
      await this.execSsh(serverId, `rm -f '${escaped}'`);
      return;
    }

    const resolved = this.validatePath(filePath);
    if (!fs.existsSync(resolved)) throw new NotFoundException('File not found');
    fs.rmSync(resolved, { recursive: false });
  }

  // ── streamDownload (local only) ───────────────────────────────────────────

  streamDownload(filePath: string, res: Response): void {
    const resolved = this.validatePath(filePath);
    if (!fs.existsSync(resolved)) throw new NotFoundException('File not found');
    const filename = path.basename(resolved);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(resolved).pipe(res);
  }
}

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PM2Service } from '../pm2/pm2.service';
import { EnvVarDto, EnvFileDto } from '@hamyar-ops/shared';

const ALLOWED_ROOTS = (process.env.FILE_BROWSER_ROOTS || '/etc/nginx,/opt/hamyar,/var/log,/var/www')
  .split(',')
  .map((r) => path.resolve(r.trim()));

@Injectable()
export class EnvEditorService {
  constructor(
    private prisma: PrismaService,
    private pm2: PM2Service,
  ) {}

  private validatePath(filePath: string): string {
    const resolved = path.resolve(filePath);
    if (!ALLOWED_ROOTS.some((root) => resolved.startsWith(root))) {
      throw new BadRequestException('Access denied: path outside allowed directories');
    }
    return resolved;
  }

  private parseEnv(content: string): EnvVarDto[] {
    const vars: EnvVarDto[] = [];
    let pendingComment = '';

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trimEnd();

      if (line.startsWith('#')) {
        pendingComment = (pendingComment ? pendingComment + '\n' : '') + line.slice(1).trim();
        continue;
      }

      if (!line.trim()) {
        pendingComment = '';
        continue;
      }

      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        pendingComment = '';
        continue;
      }

      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1);

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      vars.push({ key, value, comment: pendingComment || undefined });
      pendingComment = '';
    }

    return vars;
  }

  private serializeEnv(vars: EnvVarDto[]): string {
    return vars
      .map(({ key, value, comment }) => {
        const commentLines = comment
          ? comment.split('\n').map((l) => `# ${l}`).join('\n') + '\n'
          : '';
        const needsQuotes = value.includes(' ') || value.includes('#') || value.includes('\n');
        const serializedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
        return `${commentLines}${key}=${serializedValue}`;
      })
      .join('\n') + '\n';
  }

  async getEnvVars(pm2Name: string): Promise<EnvFileDto> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    if (!cfg.envPath) throw new BadRequestException('No .env path configured for this app');

    const resolved = this.validatePath(cfg.envPath);
    if (!fs.existsSync(resolved)) {
      return { appName: pm2Name, envPath: cfg.envPath, vars: [] };
    }

    const content = fs.readFileSync(resolved, 'utf8');
    return {
      appName: pm2Name,
      envPath: cfg.envPath,
      vars: this.parseEnv(content),
    };
  }

  async updateEnvVars(pm2Name: string, vars: EnvVarDto[]): Promise<void> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    if (!cfg.envPath) throw new BadRequestException('No .env path configured for this app');

    const resolved = this.validatePath(cfg.envPath);
    fs.writeFileSync(resolved, this.serializeEnv(vars), 'utf8');
  }

  async updateEnvRaw(pm2Name: string, raw: string): Promise<void> {
    const cfg = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!cfg) throw new NotFoundException(`App ${pm2Name} not found`);
    if (!cfg.envPath) throw new BadRequestException('No .env path configured for this app');

    const resolved = this.validatePath(cfg.envPath);
    fs.writeFileSync(resolved, raw, 'utf8');
  }

  async saveAndRestart(pm2Name: string, vars: EnvVarDto[]): Promise<void> {
    await this.updateEnvVars(pm2Name, vars);
    await this.pm2.restart(pm2Name);
  }
}

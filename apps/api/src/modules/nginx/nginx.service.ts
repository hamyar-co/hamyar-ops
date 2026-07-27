import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NginxConfigDto, NginxStatusDto } from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class NginxService {
  private readonly sitesAvailable = process.env.NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available';
  private readonly sitesEnabled = process.env.NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled';

  async listConfigs(): Promise<NginxConfigDto[]> {
    const files = fs.readdirSync(this.sitesAvailable);
    return files.map((name) => {
      const filePath = path.join(this.sitesAvailable, name);
      const stat = fs.statSync(filePath);
      const enabledPath = path.join(this.sitesEnabled, name);
      return {
        name,
        path: filePath,
        content: fs.readFileSync(filePath, 'utf8'),
        enabled: fs.existsSync(enabledPath),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    });
  }

  async getConfig(name: string): Promise<NginxConfigDto> {
    const safeName = path.basename(name);
    const filePath = path.join(this.sitesAvailable, safeName);
    if (!fs.existsSync(filePath)) throw new NotFoundException(`Config ${name} not found`);
    const stat = fs.statSync(filePath);
    const enabledPath = path.join(this.sitesEnabled, safeName);
    return {
      name: safeName,
      path: filePath,
      content: fs.readFileSync(filePath, 'utf8'),
      enabled: fs.existsSync(enabledPath),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  async updateConfig(name: string, content: string): Promise<void> {
    const safeName = path.basename(name);
    const filePath = path.join(this.sitesAvailable, safeName);
    if (!fs.existsSync(filePath)) throw new NotFoundException(`Config ${name} not found`);

    const validation = await this.validateContent(content);
    if (!validation.valid) throw new BadRequestException(`Invalid nginx config: ${validation.output}`);

    fs.writeFileSync(filePath, content, 'utf8');
  }

  async validateContent(content: string): Promise<{ valid: boolean; output: string }> {
    const tmpDir = `/tmp/nginx-validate-${Date.now()}`;
    const tmpSite = `${tmpDir}/site.conf`;
    const tmpConf = `${tmpDir}/nginx.conf`;
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(tmpSite, content);
      // nginx -t -c requires a complete config file; wrap the site block so it's valid
      fs.writeFileSync(tmpConf, `pid ${tmpDir}/nginx.pid;\nevents {}\nhttp {\n  include ${tmpSite};\n}\n`);
      const { stderr } = await execFileAsync('nginx', ['-t', '-c', tmpConf]);
      return { valid: true, output: stderr || 'Configuration is valid' };
    } catch (err: any) {
      return { valid: false, output: err.stderr || err.message };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  async reload(): Promise<{ output: string }> {
    const { stderr } = await execFileAsync('systemctl', ['reload', 'nginx']);
    return { output: stderr || 'Nginx reloaded successfully' };
  }

  async restart(): Promise<{ output: string }> {
    const { stderr } = await execFileAsync('systemctl', ['restart', 'nginx']);
    return { output: stderr || 'Nginx restarted successfully' };
  }

  async getStatus(): Promise<NginxStatusDto> {
    let running = false;
    let version = '';
    let configTest: 'ok' | 'error' = 'ok';
    let configTestOutput = '';

    try {
      await execFileAsync('systemctl', ['is-active', 'nginx']);
      running = true;
    } catch {}

    try {
      const { stdout } = await execFileAsync('nginx', ['-v']);
      version = stdout || '';
    } catch (e: any) {
      version = e.stderr || '';
    }

    try {
      await execFileAsync('nginx', ['-t']);
    } catch (e: any) {
      configTest = 'error';
      configTestOutput = e.stderr || '';
    }

    const availableSites = fs.readdirSync(this.sitesAvailable);
    const enabledSites = fs.existsSync(this.sitesEnabled) ? fs.readdirSync(this.sitesEnabled) : [];

    return { running, version, configTest, configTestOutput, activeSites: enabledSites, availableSites };
  }

  async enableSite(name: string): Promise<void> {
    const safeName = path.basename(name);
    const src = path.join(this.sitesAvailable, safeName);
    const dst = path.join(this.sitesEnabled, safeName);
    if (!fs.existsSync(src)) throw new NotFoundException(`Site ${name} not found`);
    if (!fs.existsSync(dst)) fs.symlinkSync(src, dst);
  }

  async disableSite(name: string): Promise<void> {
    const safeName = path.basename(name);
    const dst = path.join(this.sitesEnabled, safeName);
    if (fs.existsSync(dst)) fs.unlinkSync(dst);
  }

  async getSslStatus() {
    try {
      const { stdout } = await execFileAsync('certbot', ['certificates']);
      return { raw: stdout };
    } catch {
      return { raw: 'certbot not available' };
    }
  }
}

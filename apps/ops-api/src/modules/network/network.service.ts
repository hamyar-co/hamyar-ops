import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ServerPortsDto, OpenPortDto, UfwStatusDto } from '@hamyar-ops/shared';

const exec = promisify(execFile);

// Ports that must NEVER be blocked — blocking them locks the operator out.
const PROTECTED_PORTS = [22, 80, 443];

// Known service hinting by port
const SERVICE_MAP: Record<number, string> = {
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP / Nginx',
  443: 'HTTPS / Nginx',
  3000: 'NestJS API',
  3001: 'Next.js main',
  3003: 'Next.js panel',
  3004: 'Ops UI',
  3005: 'Ops API',
  5432: 'PostgreSQL',
  6379: 'Redis',
  9000: 'MinIO API',
  9001: 'MinIO Console',
};

@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);

  constructor(private prisma: PrismaService) {}

  async getServerPorts(): Promise<ServerPortsDto> {
    const [ports, ufwStatus] = await Promise.all([
      this.listOpenPorts(),
      this.getUfwStatus().catch(() => this.emptyUfw()),
    ]);

    // attach ufw action per port
    const ufwByPort = new Map<number, string>();
    for (const r of ufwStatus.rules) {
      if (r.port != null && !ufwByPort.has(r.port)) ufwByPort.set(r.port, r.action);
    }
    for (const p of ports) {
      p.ufwAction = (ufwByPort.get(p.port) ?? null) as OpenPortDto['ufwAction'];
    }

    const pipeline = ports
      .filter((p) => p.processName || p.port)
      .map((p) => ({
        port: p.port,
        protocol: p.protocol.replace('6', ''),
        action: (p.ufwAction as 'ALLOW' | 'DENY' | 'RESTRICT_LOCALHOST') ?? (p.exposed ? 'ALLOW' : 'DENY'),
        safe: !PROTECTED_PORTS.includes(p.port),
        reason: PROTECTED_PORTS.includes(p.port)
          ? 'Protected — required for access; cannot be blocked'
          : p.exposed
            ? `Exposed externally (bound ${p.bindAddress}). Deny to restrict to localhost.`
            : 'Local only — not reachable from outside the server.',
      }));

    return { ports, ufwStatus, pipeline };
  }

  async listOpenPorts(): Promise<OpenPortDto[]> {
    let stdout = '';
    try {
      const res = await exec('ss', ['-tlnup', '--no-header']);
      stdout = res.stdout;
    } catch {
      return [];
    }

    const seen = new Set<string>();
    const out: OpenPortDto[] = [];

    for (const raw of stdout.split('\n').map((l) => l.trim()).filter(Boolean)) {
      // columns: NETID STATE RECV-Q SEND-Q LOCAL-ADDR:PORT PEER-ADDR:PORT process
      const cols = raw.split(/\s+/);
      // ss columns: Netid State Recv-Q Send-Q Local-Addr:Port Peer-Addr:Port Process…
      const local = cols[4] ?? '';
      const state = cols[1] ?? '';
      const proto = cols[0] ?? 'tcp';
      const processInfo = cols.slice(6).join(' ') ?? '';

      const portMatch = local.match(/:([0-9]+)$/);
      if (!portMatch) continue;
      const port = parseInt(portMatch[1], 10);
      if (Number.isNaN(port)) continue;

      const isV6 = local.startsWith('[') || local.includes(':') && local.startsWith('*:') === false && local.includes('::');
      const bindAddress = local.substring(0, local.lastIndexOf(':')).replace(/^\[/, '').replace(/\]$/, '');

      // exposed = bound to 0.0.0.0, ::, or * (anything-but-loopback)
      const exposed = ['0.0.0.0', '::', '*', ':::'].includes(bindAddress) || bindAddress === '';

      const procMatch = processInfo.match(/users:\(\("([^"]+)"(?:,pid=(\d+))?/);
      const processName = procMatch?.[1] ?? '';
      const pid = procMatch?.[2] ? parseInt(procMatch[2], 10) : null;

      const protocol = (proto + (isV6 && !proto.endsWith('6') ? '6' : '')) as any;
      const key = `${port}:${protocol}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        port,
        protocol,
        state,
        bindAddress: bindAddress || (isV6 ? '::' : '0.0.0.0'),
        processName,
        pid,
        exposed,
        service: SERVICE_MAP[port] ?? null,
        ufwAction: null,
      });
    }
    return out.sort((a, b) => a.port - b.port);
  }

  async getUfwStatus(): Promise<UfwStatusDto> {
    const installed = await this.ufwInstalled();
    if (!installed) return this.emptyUfw();

    let enabled = false;
    try {
      const { stdout } = await exec('ufw', ['status', 'verbose']);
      enabled = stdout.toLowerCase().includes('status: active');
      return { installed: true, enabled, loaded: enabled, rules: this.parseUfw(stdout) };
    } catch (e: any) {
      if (e?.stderr?.toLowerCase().includes('not installed')) return this.emptyUfw();
      return { installed: true, enabled: false, loaded: false, rules: [] };
    }
  }

  private parseUfw(out: string) {
    const rules: any[] = [];
    for (const line of out.split('\n').map((l) => l.trim())) {
      const m = line.match(/^(ALLOW|DENY|FWD)\s+(IN|OUT|FWD)?\s*([^\s]+)\/?(\w+)?\s*(.*)$/);
      if (!m) continue;
      const action = m[1] as 'ALLOW' | 'DENY' | 'FWD';
      let direction = (m[2] || (action === 'FWD' ? 'IN' : 'IN')) as 'IN' | 'OUT';
      const rest = m[3] ?? '';
      const protocol = m[4] ?? null;
      const port = /^\d+$/.test(rest) ? parseInt(rest, 10) : null;
      const from = m[5]?.trim() ? m[5].trim() : null;
      rules.push({ action, direction, port, protocol, from, to: null });
    }
    return rules;
  }

  private emptyUfw(): UfwStatusDto {
    return { installed: false, enabled: false, loaded: false, rules: [] };
  }

  private async ufwInstalled(): Promise<boolean> {
    try { await exec('which', ['ufw']); return true; } catch { return false; }
  }

  private async addDockerUserRule(port: number, protocol: string) {
    try {
      await exec('iptables', ['-D', 'DOCKER-USER', '-p', protocol, '--dport', port.toString(), '-j', 'DROP']).catch(() => {});
      await exec('iptables', ['-I', 'DOCKER-USER', '-p', protocol, '--dport', port.toString(), '-j', 'DROP']);
    } catch {}
  }

  private async removeDockerUserRule(port: number, protocol: string) {
    try {
      await exec('iptables', ['-D', 'DOCKER-USER', '-p', protocol, '--dport', port.toString(), '-j', 'DROP']).catch(() => {});
    } catch {}
  }

  async setPortPolicy(port: number, action: 'allow' | 'deny', protocol = 'tcp'): Promise<void> {
    if (Number.isNaN(port) || port < 1 || port > 65535) throw new BadRequestException('Invalid port');
    if (PROTECTED_PORTS.includes(port)) {
      throw new BadRequestException(`Port ${port} is protected and may not be ${action === 'deny' ? 'blocked' : 'changed'} (would lock you out).`);
    }
    if (!(await this.ufwInstalled())) throw new BadRequestException('ufw is not installed on this server');

    try {
      if (action === 'allow') {
        await exec('ufw', ['delete', 'deny', `${port}/${protocol}`]).catch(() => {});
        await exec('ufw', ['allow', `${port}/${protocol}`]);
        await this.removeDockerUserRule(port, protocol);
      } else {
        await exec('ufw', ['delete', 'allow', `${port}/${protocol}`]).catch(() => {});
        await exec('ufw', ['deny', `${port}/${protocol}`]);
        await this.addDockerUserRule(port, protocol);
      }
    } catch (e: any) {
      throw new BadRequestException((e?.stderr || e?.message || 'ufw command failed').toString().trim());
    }

    // mirror in DB for persistence UI
    await this.prisma.networkRule.upsert({
      where: { port_protocol: { port, protocol } },
      update: { action: action === 'allow' ? 'ALLOW' : 'DENY', enabled: true },
      create: { port, protocol, action: action === 'allow' ? 'ALLOW' : 'DENY', enabled: true },
    });
  }

  async ensureEnabled(active: boolean): Promise<void> {
    if (!(await this.ufwInstalled())) throw new BadRequestException('ufw is not installed');
    if (active) await exec('ufw', ['--force', 'enable']).catch((e) => { throw new BadRequestException((e?.stderr || e?.message || '').toString()); });
    else await exec('ufw', ['disable']).catch(() => {});
  }

  async restrictToLocalhost(port: number, protocol = 'tcp'): Promise<{ success: boolean; message: string }> {
    if (Number.isNaN(port) || port < 1 || port > 65535) throw new BadRequestException('Invalid port');
    if (PROTECTED_PORTS.includes(port)) {
      throw new BadRequestException(`Port ${port} is protected and may not be restricted.`);
    }
    if (!(await this.ufwInstalled())) throw new BadRequestException('ufw is not installed on this server');

    try {
      await exec('ufw', ['--force', 'disable']);
      await exec('ufw', ['allow', 'from', '127.0.0.1', 'to', 'any', 'port', `${port}`, 'proto', protocol]);
      await exec('ufw', ['allow', 'from', '::1', 'to', 'any', 'port', `${port}`, 'proto', protocol]);
      await exec('ufw', ['deny', `${port}/${protocol}`]);
      await exec('ufw', ['--force', 'enable']);
      await this.addDockerUserRule(port, protocol);
    } catch (e: any) {
      await exec('ufw', ['--force', 'disable']).catch(() => {});
      throw new BadRequestException((e?.stderr || e?.message || 'ufw command failed').toString().trim());
    }

    await this.prisma.networkRule.upsert({
      where: { port_protocol: { port, protocol } },
      update: { action: 'RESTRICT_LOCALHOST', enabled: true },
      create: { port, protocol, action: 'RESTRICT_LOCALHOST', enabled: true },
    });

    return {
      success: true,
      message: `Port ${port} is now restricted to localhost only. External access is denied.`,
    };
  }

  async disableAllExternalAccess(): Promise<{ success: boolean; message: string; restrictedPorts: number[]; protectedPorts: number[] }> {
    if (!(await this.ufwInstalled())) throw new BadRequestException('ufw is not installed on this server');

    const ports = await this.listOpenPorts();
    const protectedPorts = ports.filter(p => PROTECTED_PORTS.includes(p.port)).map(p => p.port);
    const nonProtectedPorts = ports.filter(p => !PROTECTED_PORTS.includes(p.port) && p.exposed);

    try {
      await exec('ufw', ['--force', 'disable']);
      for (const p of nonProtectedPorts) {
        const proto = p.protocol.replace('6', '');
        await exec('ufw', ['allow', 'from', '127.0.0.1', 'to', 'any', 'port', `${p.port}`, 'proto', proto]);
        await exec('ufw', ['allow', 'from', '::1', 'to', 'any', 'port', `${p.port}`, 'proto', proto]);
        await exec('ufw', ['deny', `${p.port}/${proto}`]);
        await this.addDockerUserRule(p.port, proto);

        await this.prisma.networkRule.upsert({
          where: { port_protocol: { port: p.port, protocol: proto } },
          update: { action: 'RESTRICT_LOCALHOST', enabled: true },
          create: { port: p.port, protocol: proto, action: 'RESTRICT_LOCALHOST', enabled: true },
        });
      }
      await exec('ufw', ['--force', 'enable']);
    } catch (e: any) {
      await exec('ufw', ['--force', 'disable']).catch(() => {});
      throw new BadRequestException((e?.stderr || e?.message || 'Failed to disable external access').toString().trim());
    }

    return {
      success: true,
      message: `External access disabled for ${nonProtectedPorts.length} port(s). Protected ports (${protectedPorts.join(', ')}) remain accessible.`,
      restrictedPorts: nonProtectedPorts.map(p => p.port),
      protectedPorts,
    };
  }

  async enableExternalAccess(port?: number): Promise<{ success: boolean; message: string }> {
    if (!(await this.ufwInstalled())) throw new BadRequestException('ufw is not installed on this server');

    try {
      if (port !== undefined) {
        if (PROTECTED_PORTS.includes(port)) {
          throw new BadRequestException(`Port ${port} is protected and cannot be opened to external access.`);
        }
        await exec('ufw', ['delete', 'deny', `${port}/tcp`]).catch(() => {});
        await exec('ufw', ['allow', `${port}/tcp`]);
        await this.removeDockerUserRule(port, 'tcp');
        await this.prisma.networkRule.upsert({
          where: { port_protocol: { port, protocol: 'tcp' } },
          update: { action: 'ALLOW', enabled: true },
          create: { port, protocol: 'tcp', action: 'ALLOW', enabled: true },
        });
        return { success: true, message: `Port ${port} is now open to external access.` };
      } else {
        await exec('ufw', ['--force', 'disable']);
        const ports = await this.listOpenPorts();
        const nonProtected = ports.filter(p => !PROTECTED_PORTS.includes(p.port));
        for (const p of nonProtected) {
          const proto = p.protocol.replace('6', '');
          await exec('ufw', ['delete', 'deny', `${p.port}/${proto}`]).catch(() => {});
          await exec('ufw', ['allow', `${p.port}/${proto}`]);
          await this.removeDockerUserRule(p.port, proto);
          await this.prisma.networkRule.upsert({
            where: { port_protocol: { port: p.port, protocol: proto } },
            update: { action: 'ALLOW', enabled: true },
            create: { port: p.port, protocol: proto, action: 'ALLOW', enabled: true },
          });
        }
        await exec('ufw', ['--force', 'enable']);
        return { success: true, message: `All non-protected ports are now open to external access.` };
      }
    } catch (e: any) {
      await exec('ufw', ['--force', 'disable']).catch(() => {});
      throw new BadRequestException((e?.stderr || e?.message || 'Failed to enable external access').toString().trim());
    }
  }
}
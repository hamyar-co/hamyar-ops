import { Injectable } from '@nestjs/common';
import * as si from 'systeminformation';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ServerMetricsDto, ProcessInfoDto, SystemServiceDto } from '@hamyar-ops/shared';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export interface DependencyCheck {
  name: string;
  required: boolean;
  installed: boolean;
  version?: string;
  installCommand?: string;
  status: 'ok' | 'missing' | 'outdated';
}

export interface SystemDependencies {
  os: string;
  arch: string;
  dependencies: DependencyCheck[];
  allMet: boolean;
  criticalMissing: string[];
}

@Injectable()
export class ServerService {
  private readonly REQUIRED_DEPS = [
    { name: 'docker', required: true, installCmd: 'apt install docker.io -y' },
    { name: 'git', required: true, installCmd: 'apt install git -y' },
    { name: 'curl', required: true, installCmd: 'apt install curl -y' },
    { name: 'wget', required: true, installCmd: 'apt install wget -y' },
    { name: 'ufw', required: false, installCmd: 'apt install ufw -y' },
    { name: 'tar', required: true, installCmd: 'apt install tar -y' },
    { name: 'ssh', required: false, installCmd: 'apt install openssh-client -y' },
    { name: 'systemctl', required: false, installCmd: 'systemd-sysv' },
  ];

  async checkDependencies(): Promise<SystemDependencies> {
    const osInfo = await si.osInfo();
    const results: DependencyCheck[] = [];

    for (const dep of this.REQUIRED_DEPS) {
      const result = await this.checkDependency(dep.name, dep.required);
      results.push({
        name: dep.name,
        required: dep.required,
        installed: result.installed,
        version: result.version,
        installCommand: dep.installCmd,
        status: result.installed ? 'ok' : (dep.required ? 'missing' : 'missing'),
      });
    }

    const criticalMissing = results.filter(d => d.required && !d.installed).map(d => d.name);

    return {
      os: `${osInfo.distro} ${osInfo.release}`,
      arch: osInfo.arch,
      dependencies: results,
      allMet: criticalMissing.length === 0,
      criticalMissing,
    };
  }

  private async checkDependency(name: string, required: boolean): Promise<{ installed: boolean; version?: string }> {
    try {
      const { stdout } = await execFileAsync('which', [name]);
      if (!stdout.trim()) return { installed: false };

      try {
        const { stdout: ver } = await execFileAsync(name, ['--version']);
        const version = ver.trim().split('\n')[0].substring(0, 50);
        return { installed: true, version };
      } catch {
        try {
          const { stdout: ver } = await execFileAsync(name, ['-version']);
          const version = ver.trim().split('\n')[0].substring(0, 50);
          return { installed: true, version };
        } catch {
          return { installed: true };
        }
      }
    } catch {
      return { installed: false };
    }
  }

  async installDependency(name: string): Promise<{ success: boolean; message: string }> {
    const dep = this.REQUIRED_DEPS.find(d => d.name === name);
    if (!dep) return { success: false, message: `Unknown dependency: ${name}` };

    try {
      await execFileAsync('bash', ['-c', `apt-get update && ${dep.installCmd}`]);
      return { success: true, message: `${name} installed successfully` };
    } catch (e: any) {
      return { success: false, message: `Failed to install ${name}: ${e.message}` };
    }
  }

  async getMetrics(): Promise<ServerMetricsDto> {
    const [cpu, mem, disk, net, netIf, cpuInfo] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0, cpus: [] as any[] })),
      si.mem().catch(() => ({ total: 16 * 1024 * 1024 * 1024, used: 0, free: 16 * 1024 * 1024 * 1024, active: 0, available: 16 * 1024 * 1024 * 1024, buffers: 0, cached: 0, swaptotal: 0, swapused: 0, swapfree: 0 })),
      si.fsSize().catch(() => [] as any[]),
      si.networkStats().catch(() => [] as any[]),
      si.networkInterfaces().catch(() => [] as any[]),
      si.cpu().catch(() => ({ physicalCores: 1, brand: 'Generic CPU', speed: '2.5' })),
    ]);

    const primaryNet = (net && net[0]) || { rx_bytes: 0, tx_bytes: 0, rx_sec: 0, tx_sec: 0, iface: '' };

    const interfaceDetails = await Promise.all(
      (netIf as any[]).map(async (iface) => {
        const stats = (net as any[]).find((n) => n.iface === iface.iface) || {
          rx_bytes: 0, tx_bytes: 0
        };
        return {
          name: iface.iface,
          ip4: iface.ip4 || '',
          ip6: iface.ip6 || '',
          mac: iface.mac || '',
          type: iface.type || '',
          speed: iface.speed || 0,
          duplex: iface.duplex || '',
          operstate: iface.operstate || 'unknown',
          rxBytes: stats.rx_bytes,
          txBytes: stats.tx_bytes,
          rxPackets: 0,
          txPackets: 0,
          rxErrors: 0,
          txErrors: 0,
        };
      })
    );

    return {
      cpu: {
        percent: parseFloat(cpu.currentLoad.toFixed(2)),
        cores: cpuInfo.physicalCores,
        model: cpuInfo.brand,
        speed: parseFloat(String(cpuInfo.speed)) || 0,
        usage: {
          user: parseFloat((cpu.currentLoad - (cpu.cpus[0]?.load ?? 0)).toFixed(2)),
          system: parseFloat(cpu.cpus[0]?.load?.toFixed(2) || '0'),
          idle: parseFloat((100 - cpu.currentLoad).toFixed(2)),
          iowait: 0,
          irq: 0,
          softirq: 0,
          steal: 0,
        },
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        percent: parseFloat(((mem.used / mem.total) * 100).toFixed(2)),
        usage: {
          available: mem.available,
          buffers: mem.buffers,
          cached: mem.cached,
          swapTotal: mem.swaptotal,
          swapUsed: mem.swapused,
          swapFree: mem.swapfree,
          swapPercent: parseFloat(((mem.swapused / (mem.swaptotal || 1)) * 100).toFixed(2)),
        },
      },
      disk: disk.map((d) => ({
        filesystem: d.fs,
        size: d.size,
        used: d.used,
        available: d.available ?? (d.size - d.used),
        percent: parseFloat(d.use.toFixed(2)),
        mount: d.mount,
      })),
      network: {
        rx: primaryNet.rx_bytes,
        tx: primaryNet.tx_bytes,
        rxSec: primaryNet.rx_sec ?? 0,
        txSec: primaryNet.tx_sec ?? 0,
        interface: primaryNet.iface,
        usage: {
          totalRx: (net as any[]).reduce((acc: number, n: any) => acc + (n.rx_bytes || 0), 0),
          totalTx: (net as any[]).reduce((acc: number, n: any) => acc + (n.tx_bytes || 0), 0),
          packetsRx: 0,
          packetsTx: 0,
          errorsRx: 0,
          errorsTx: 0,
          dropsRx: 0,
          dropsTx: 0,
        },
        interfaces: interfaceDetails,
      },
      timestamp: Date.now(),
    };
  }

  async getProcesses(sortBy = 'cpu', limit = 20): Promise<ProcessInfoDto[]> {
    const procs = await si.processes();
    const list = procs.list
      .sort((a, b) => {
        if (sortBy === 'memory') return (b.mem ?? 0) - (a.mem ?? 0);
        return (b.cpu ?? 0) - (a.cpu ?? 0);
      })
      .slice(0, limit);

    return list.map((p) => ({
      pid: p.pid,
      name: p.name,
      cpu: p.cpu ?? 0,
      memory: p.mem ?? 0,
      status: p.state ?? '',
      started: p.started ?? '',
      command: p.command ?? '',
      user: p.user ?? '',
    }));
  }

  async killProcess(pid: number): Promise<void> {
    await execFileAsync('kill', ['-9', String(pid)]);
  }

  async getServices(): Promise<SystemServiceDto[]> {
    try {
      const services = await si.services('nginx,postgresql,redis,docker,ssh');
      return services.map((s) => ({
        name: s.name,
        displayName: s.name,
        status: s.running ? 'running' : 'stopped',
        enabled: (s as any).enabled ?? false,
        description: '',
      }));
    } catch {
      return [];
    }
  }

  async controlService(name: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    const allowed = ['nginx', 'postgresql', 'redis', 'docker', 'ssh', 'cron'];
    if (!allowed.includes(name)) throw new Error(`Service ${name} not allowed`);
    await execFileAsync('systemctl', [action, name]);
  }

  async rebootServer(): Promise<{ success: boolean; message: string }> {
    try {
      await execFileAsync('shutdown', ['-r', 'now', 'Reboot requested via hamyar-ops panel']);
      return { success: true, message: 'Reboot initiated. Server will restart in a few seconds.' };
    } catch (e: any) {
      if (e.message?.includes('Operation not permitted') || e.message?.includes('must be root')) {
        try {
          await execFileAsync('bash', ['-c', 'nohup shutdown -r now > /dev/null 2>&1 &']);
          return { success: true, message: 'Reboot initiated. Server will restart in a few seconds.' };
        } catch {
          throw new Error('Failed to initiate reboot. Root privileges required.');
        }
      }
      throw new Error(`Reboot failed: ${e.message}`);
    }
  }

  async shutdownServer(): Promise<{ success: boolean; message: string }> {
    try {
      await execFileAsync('shutdown', ['-h', 'now', 'Shutdown requested via hamyar-ops panel']);
      return { success: true, message: 'Shutdown initiated. Server will halt.' };
    } catch (e: any) {
      if (e.message?.includes('Operation not permitted') || e.message?.includes('must be root')) {
        try {
          await execFileAsync('bash', ['-c', 'nohup shutdown -h now > /dev/null 2>&1 &']);
          return { success: true, message: 'Shutdown initiated. Server will halt.' };
        } catch {
          throw new Error('Failed to initiate shutdown. Root privileges required.');
        }
      }
      throw new Error(`Shutdown failed: ${e.message}`);
    }
  }

  async getDiskInfo() {
    return si.fsSize();
  }

  async getUsers() {
    return si.users();
  }

  async getNetworkInfo() {
    const [stats, interfaces] = await Promise.all([si.networkStats(), si.networkInterfaces()]);
    return { stats, interfaces };
  }
}

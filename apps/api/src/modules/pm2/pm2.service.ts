import { Injectable, OnModuleInit, OnModuleDestroy, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import * as pm2 from 'pm2';
import { PM2ProcessDto } from '@hamyar-ops/shared';

@Injectable()
export class PM2Service implements OnModuleInit, OnModuleDestroy {
  private connected = false;
  private bus: any = null;
  private logSubscribers = new Map<string, Set<(line: any) => void>>();

  async onModuleInit() {
    await this.connect();
    await this.initBus();
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect(false, (err) => {
        if (err) return reject(err);
        this.connected = true;
        resolve();
      });
    });
  }

  private async initBus() {
    return new Promise<void>((resolve) => {
      pm2.launchBus((err, bus) => {
        if (err) { resolve(); return; }
        this.bus = bus;
        bus.on('log:out', (packet: any) => this.emitLog(packet.process.name, packet.data, 'out'));
        bus.on('log:err', (packet: any) => this.emitLog(packet.process.name, packet.data, 'err'));
        resolve();
      });
    });
  }

  private emitLog(name: string, data: string, level: 'out' | 'err') {
    const subs = this.logSubscribers.get(name) || this.logSubscribers.get('*');
    subs?.forEach((cb) => cb({ name, data, level, timestamp: Date.now() }));
  }

  subscribeToLogs(name: string, cb: (line: any) => void) {
    const key = name === '*' ? '*' : name;
    if (!this.logSubscribers.has(key)) this.logSubscribers.set(key, new Set());
    this.logSubscribers.get(key)!.add(cb);
    return () => this.logSubscribers.get(key)?.delete(cb);
  }

  async list(): Promise<PM2ProcessDto[]> {
    return new Promise((resolve, reject) => {
      pm2.list((err, list) => {
        if (err) return reject(err);
        resolve(list.map(this.mapProcess));
      });
    });
  }

  async describe(name: string): Promise<PM2ProcessDto> {
    return new Promise((resolve, reject) => {
      pm2.describe(name, (err, list) => {
        if (err || !list?.length) return reject(new NotFoundException(`Process ${name} not found`));
        resolve(this.mapProcess(list[0]));
      });
    });
  }

  async restart(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.restart(name, (err) => err ? reject(err) : resolve());
    });
  }

  async stop(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.stop(name, (err) => err ? reject(err) : resolve());
    });
  }

  async delete(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.delete(name, (err) => err ? reject(err) : resolve());
    });
  }

  async reload(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.reload(name, (err) => err ? reject(err) : resolve());
    });
  }

  async start(options: pm2.StartOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.start(options, (err) => err ? reject(err) : resolve());
    });
  }

  async save(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.dump((err) => err ? reject(err) : resolve());
    });
  }

  async getLogs(name: string, lines = 200): Promise<string[]> {
    const proc = await this.describe(name);
    const { execSync } = require('child_process');
    try {
      const outFile = proc.logOutPath;
      if (!outFile) return [];
      const output = execSync(`tail -n ${lines} "${outFile}" 2>/dev/null || true`, { encoding: 'utf8' });
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  private mapProcess(proc: pm2.ProcessDescription): PM2ProcessDto {
    const m = proc.pm2_env as any;
    return {
      id: proc.pm_id ?? 0,
      name: proc.name ?? '',
      status: (m?.status ?? 'stopped') as PM2ProcessDto['status'],
      pid: proc.pid ?? null,
      cpu: (m?.monit?.cpu ?? (proc as any).monit?.cpu) ?? 0,
      memory: (m?.monit?.memory ?? (proc as any).monit?.memory) ?? 0,
      uptime: m?.pm_uptime ? Date.now() - m.pm_uptime : 0,
      restarts: m?.restart_time ?? 0,
      script: m?.script ?? '',
      cwd: m?.cwd ?? '',
      mode: m?.exec_mode ?? 'fork',
      instances: m?.instances ?? 1,
      pm2Id: proc.pm_id ?? 0,
      namespace: m?.namespace ?? 'default',
      version: m?.version ?? '',
      env: m?.env ?? {},
      logOutPath: m?.pm_out_log_path ?? '',
      logErrPath: m?.pm_err_log_path ?? '',
      maxMemoryRestart: m?.max_memory_restart ? String(m.max_memory_restart) : null,
    };
  }

  async onModuleDestroy() {
    if (this.bus) {
      try { this.bus.off('*'); } catch {}
    }
    if (this.connected) {
      pm2.disconnect();
    }
  }
}

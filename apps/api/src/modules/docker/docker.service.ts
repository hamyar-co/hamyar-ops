import { Injectable, OnModuleInit, OnModuleDestroy, NotFoundException, BadRequestException } from '@nestjs/common';
import * as Dockerode from 'dockerode';
import { ContainerDto, ContainerStatsDto, ImageDto, NetworkDto, VolumeDto } from '@hamyar-ops/shared';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);
const exec = promisify(execFile);

const COMPOSE_DIR = process.env.COMPOSE_DIR || '/opt/hamyar/compose-uploads';

@Injectable()
export class DockerService implements OnModuleInit, OnModuleDestroy {
  private docker: Dockerode;
  private statsStreams = new Map<string, NodeJS.ReadableStream>();
  private statsSubscribers = new Map<string, Set<(stats: ContainerStatsDto) => void>>();
  private eventSubscribers: Set<(event: any) => void> = new Set();
  private eventStream: NodeJS.ReadableStream | null = null;

  onModuleInit() {
    this.docker = new Dockerode({
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    });
    this.startEventStream();
  }

  private startEventStream() {
    this.docker.getEvents({}, (err, stream) => {
      if (err || !stream) return;
      this.eventStream = stream;
      stream.on('data', (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString());
          this.eventSubscribers.forEach((cb) => cb(event));
        } catch {}
      });
    });
  }

  subscribeToEvents(cb: (event: any) => void) {
    this.eventSubscribers.add(cb);
    return () => this.eventSubscribers.delete(cb);
  }

  async subscribeToStats(id: string, cb: (stats: ContainerStatsDto) => void) {
    if (!this.statsSubscribers.has(id)) this.statsSubscribers.set(id, new Set());
    this.statsSubscribers.get(id)!.add(cb);

    if (!this.statsStreams.has(id)) {
      const container = this.docker.getContainer(id);
      const stream = await container.stats({ stream: true }) as NodeJS.ReadableStream;
      this.statsStreams.set(id, stream);
      stream.on('data', (chunk: Buffer) => {
        try {
          const raw = JSON.parse(chunk.toString());
          const stats = this.parseStats(id, raw);
          this.statsSubscribers.get(id)?.forEach((c) => c(stats));
        } catch {}
      });
      stream.on('end', () => {
        this.statsStreams.delete(id);
        this.statsSubscribers.delete(id);
      });
    }

    return () => {
      this.statsSubscribers.get(id)?.delete(cb);
      if (!this.statsSubscribers.get(id)?.size) {
        (this.statsStreams.get(id) as any)?.destroy?.();
        this.statsStreams.delete(id);
        this.statsSubscribers.delete(id);
      }
    };
  }

  async listContainers(): Promise<ContainerDto[]> {
    const containers = await this.docker.listContainers({ all: true });
    return (containers || []).map((c) => this.mapContainer(c));
  }

  async inspectContainer(id: string) {
    const container = this.docker.getContainer(id);
    return container.inspect();
  }

  async startContainer(id: string) {
    await this.docker.getContainer(id).start();
  }

  async stopContainer(id: string) {
    await this.docker.getContainer(id).stop();
  }

  async restartContainer(id: string) {
    await this.docker.getContainer(id).restart();
  }

  async removeContainer(id: string) {
    await this.docker.getContainer(id).remove({ force: true });
  }

  async getContainerLogs(id: string, lines = 200, since?: string, until?: string): Promise<string[]> {
    const container = this.docker.getContainer(id);
    const opts: any = { stdout: true, stderr: true, tail: lines, timestamps: true };
    if (since) opts.since = Math.floor(Date.parse(since) / 1000);
    if (until) opts.until = Math.floor(Date.parse(until) / 1000) + 1;
    const logs = await container.logs(opts) as unknown as Buffer;
    return this.parseDockerLogs(logs);
  }

  async getContainerStats(id: string): Promise<ContainerStatsDto | null> {
    try {
      const container = this.docker.getContainer(id);
      const stats = await container.stats({ stream: false }) as any;
      return this.parseStats(id, stats);
    } catch {
      return null;
    }
  }

  async getAllContainerStats(): Promise<{ containerId: string; containerName: string; stats: ContainerStatsDto }[]> {
    const containers = await this.listContainers();
    const runningContainers = containers.filter(c => c.state === 'running');

    const results: { containerId: string; containerName: string; stats: ContainerStatsDto }[] = [];

    for (const container of runningContainers) {
      const stats = await this.getContainerStats(container.id);
      if (stats) {
        results.push({
          containerId: container.id,
          containerName: container.name,
          stats,
        });
      }
    }

    return results;
  }

  async listImages(): Promise<ImageDto[]> {
    const images = await this.docker.listImages({ all: false });
    return images.map((img) => ({
      id: img.Id.replace('sha256:', '').substring(0, 12),
      tags: img.RepoTags ?? [],
      size: img.Size,
      created: img.Created,
      digest: img.Id,
    }));
  }

  async pullImage(image: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: any, stream: any) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (err2: any) => {
          if (err2) reject(err2); else resolve();
        });
      });
    });
  }

  async removeImage(id: string) {
    await this.docker.getImage(id).remove({ force: true });
  }

  async listNetworks(): Promise<NetworkDto[]> {
    const networks = await this.docker.listNetworks();
    return networks.map((n) => ({
      id: n.Id,
      name: n.Name,
      driver: n.Driver,
      scope: n.Scope,
      ipam: n.IPAM?.Config?.map((c: any) => ({ subnet: c.Subnet, gateway: c.Gateway })) ?? [],
      containers: Object.fromEntries(
        Object.entries(n.Containers ?? {}).map(([k, v]: [string, any]) => [
          k,
          { name: v.Name, ipv4Address: v.IPv4Address },
        ]),
      ),
    }));
  }

  async listVolumes(): Promise<VolumeDto[]> {
    const { Volumes } = await this.docker.listVolumes();
    return (Volumes ?? []).map((v: any) => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      createdAt: v.CreatedAt ?? '',
      labels: v.Labels ?? {},
      scope: v.Scope,
    }));
  }

  async composeUp(services?: string[]) {
    const file = process.env.DOCKER_COMPOSE_FILE || '/opt/hamyar/backend/docker-compose.yml';
    const args = ['-f', file, 'up', '-d'];
    if (services?.length) args.push(...services);
    const { stdout } = await execFileAsync('docker', ['compose', ...args]);
    return { output: stdout };
  }

  async composeDown() {
    const file = process.env.DOCKER_COMPOSE_FILE || '/opt/hamyar/backend/docker-compose.yml';
    const { stdout } = await execFileAsync('docker', ['compose', '-f', file, 'down']);
    return { output: stdout };
  }

  async composePull() {
    const file = process.env.DOCKER_COMPOSE_FILE || '/opt/hamyar/backend/docker-compose.yml';
    const { stdout } = await execFileAsync('docker', ['compose', '-f', file, 'pull']);
    return { output: stdout };
  }

  // ── Compose upload + run ──
  async composeRun(dto: { name: string; content: string; services?: string[]; up?: boolean }) {
    if (!dto.name || !dto.content) throw new BadRequestException('name and content are required');
    const dir = path.join(COMPOSE_DIR, dto.name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'docker-compose.yml');
    fs.writeFileSync(file, dto.content, 'utf8');

    let output = '';
    if (dto.up !== false) {
      const args = ['compose', '-f', file, '-p', dto.name, 'up', '-d'];
      if (dto.services?.length) args.push(...dto.services);
      const res = await execFileAsync('docker', args);
      output = res.stdout;
    }
    return { file, project: dto.name, output };
  }

  async composeDownByName(name: string) {
    const file = path.join(COMPOSE_DIR, name, 'docker-compose.yml');
    if (!fs.existsSync(file)) throw new NotFoundException(`compose project ${name} not found`);
    const { stdout } = await execFileAsync('docker', ['compose', '-f', file, '-p', name, 'down']);
    return { output: stdout };
  }

  async listComposeFiles() {
    fs.mkdirSync(COMPOSE_DIR, { recursive: true });
    const out: { name: string; file: string; size: number; modified: string }[] = [];
    for (const name of fs.readdirSync(COMPOSE_DIR)) {
      const file = path.join(COMPOSE_DIR, name, 'docker-compose.yml');
      if (!fs.existsSync(file)) continue;
      const st = fs.statSync(file);
      out.push({ name, file, size: st.size, modified: st.mtime.toISOString() });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    // include the default backend compose file as well
    const defaults: string[] = (process.env.DOCKER_COMPOSE_FILE || '/opt/hamyar/backend/docker-compose.yml').split(',').filter(Boolean);
    for (const f of defaults) {
      if (fs.existsSync(f)) {
        const st = fs.statSync(f);
        out.unshift({ name: '(default)', file: f, size: st.size, modified: st.mtime.toISOString() });
      }
    }
    return out;
  }

  getComposeFile(name: string): string {
    if (name === '(default)') return process.env.DOCKER_COMPOSE_FILE || '/opt/hamyar/backend/docker-compose.yml';
    const file = path.join(COMPOSE_DIR, name, 'docker-compose.yml');
    if (!fs.existsSync(file)) throw new NotFoundException('compose file not found');
    return file;
  }

  // ── Direct DB dump (.sql) and restore ──
  async dbDumpSql(engine: 'postgres' | 'mysql', container: string, database: string, user?: string): Promise<Buffer> {
    const u = user || (engine === 'postgres' ? 'postgres' : 'root');
    let cmd: string[];
    if (engine === 'postgres') {
      cmd = ['exec', container, 'pg_dump', '-U', u, '--no-owner', '--clean', '--if-exists', database];
    } else {
      cmd = ['exec', container, 'sh', '-c', `mysqldump -u ${u} ${database}`];
    }
    const { stdout } = await execFileAsync('docker', cmd, { maxBuffer: 1024 * 1024 * 1024, encoding: 'buffer' });
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  }

  async dbRestoreSql(engine: 'postgres' | 'mysql', container: string, database: string, sql: string, user?: string) {
    const u = user || (engine === 'postgres' ? 'postgres' : 'root');
    const cmd = engine === 'postgres'
      ? ['exec', '-i', container, 'psql', '-U', u, '-d', database]
      : ['exec', '-i', container, 'sh', '-c', `mysql ${database}`];
    return new Promise<{ output: string }>((resolve, reject) => {
      const child = execFile('docker', cmd, { maxBuffer: 1024 * 1024 * 1024 });
      let out = '';
      child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (out += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(`restore exited ${code}: ${out}`));
        resolve({ output: out });
      });
      (child as any).stdin.end(sql);
    });
  }

  async listDatabases(): Promise<{ containerId: string; containerName: string; engine: 'postgres' | 'mysql'; databases: string[] }[]> {
    const results: { containerId: string; containerName: string; engine: 'postgres' | 'mysql'; databases: string[] }[] = [];

    // 1. Scan Docker containers
    try {
      const containers = await this.listContainers();
      const dbContainers = containers.filter(c => {
        const img = c.image.toLowerCase();
        const hasPostgres = img.includes('postgres');
        const hasMysql = img.includes('mysql') || img.includes('mariadb');
        const has5432 = c.ports.some(p => p.containerPort === 5432);
        const has3306 = c.ports.some(p => p.containerPort === 3306);
        return hasPostgres || hasMysql || has5432 || has3306;
      });

      for (const container of dbContainers) {
        const img = container.image.toLowerCase();
        const hasPostgres = img.includes('postgres');
        const engine: 'postgres' | 'mysql' = hasPostgres ? 'postgres' : 'mysql';
        const containerName = container.name;
        const containerId = container.id;

        try {
          let databases: string[] = [];
          if (engine === 'postgres') {
            const { stdout } = await exec('docker', ['exec', containerName, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-c', 'SELECT datname FROM pg_database WHERE datistemplate = false;'], { maxBuffer: 1024 * 1024 });
            databases = stdout.trim().split('\n').map(d => d.trim()).filter(Boolean);
          } else {
            const { stdout } = await exec('docker', ['exec', containerName, 'sh', '-c', 'mysql -u root -e "SHOW DATABASES;"'], { maxBuffer: 1024 * 1024 });
            databases = stdout.trim().split('\n').filter(d => d.trim() && d.trim() !== 'Database').map(d => d.trim());
          }
          results.push({ containerId, containerName, engine, databases });
        } catch (e) {
          results.push({ containerId, containerName, engine, databases: [] });
        }
      }
    } catch (err) {
      // Docker daemon might be offline or not accessible
    }

    // 2. Scan Local Host Databases
    try {
      const pgInstalled = await execFileAsync('which', ['psql']).then(() => true).catch(() => false);
      if (pgInstalled) {
        try {
          const { stdout } = await execFileAsync('psql', ['-U', 'postgres', '-t', '-c', 'SELECT datname FROM pg_database WHERE datistemplate = false;'], { maxBuffer: 1024 * 1024 });
          const databases = stdout.trim().split('\n').map(d => d.trim()).filter(Boolean);
          if (databases.length > 0) {
            results.push({
              containerId: 'local-postgres',
              containerName: 'Local Postgres (Host)',
              engine: 'postgres',
              databases,
            });
          }
        } catch {}
      }
    } catch {}

    try {
      const mysqlInstalled = await execFileAsync('which', ['mysql']).then(() => true).catch(() => false);
      if (mysqlInstalled) {
        try {
          const { stdout } = await execFileAsync('mysql', ['-u', 'root', '-e', 'SHOW DATABASES;'], { maxBuffer: 1024 * 1024 });
          const databases = stdout.trim().split('\n').filter(d => d.trim() && d.trim() !== 'Database').map(d => d.trim());
          if (databases.length > 0) {
            results.push({
              containerId: 'local-mysql',
              containerName: 'Local MySQL (Host)',
              engine: 'mysql',
              databases,
            });
          }
        } catch {}
      }
    } catch {}

    return results;
  }

  async execContainer(id: string, cmd: string[]): Promise<{ stdout: string; stderr: string }> {
    const args = ['exec', id, ...cmd];
    return exec('docker', args, { maxBuffer: 256 * 1024 * 1024 });
  }

  private mapContainer(c: Dockerode.ContainerInfo): ContainerDto {
    return {
      id: c.Id.substring(0, 12),
      name: c.Names?.[0]?.replace('/', '') ?? '',
      image: c.Image,
      status: c.Status,
      state: c.State as ContainerDto['state'],
      ports: (c.Ports || []).map((p) => ({
        containerPort: p.PrivatePort,
        hostPort: p.PublicPort ?? null,
        protocol: p.Type,
      })),
      created: c.Created,
      labels: c.Labels ?? {},
      networkMode: c.HostConfig?.NetworkMode ?? '',
      mounts: (c.Mounts || []).map((m) => ({
        type: m.Type ?? '',
        source: m.Source ?? '',
        destination: m.Destination ?? '',
        mode: m.Mode ?? '',
      })),
    };
  }

  private parseStats(id: string, raw: any): ContainerStatsDto {
    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
    const sysDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
    const cpuCores = raw.cpu_stats.online_cpus || raw.cpu_stats.cpu_usage.percpu_usage?.length || 1;
    const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCores * 100 : 0;

    const memUsage = raw.memory_stats.usage || 0;
    const memLimit = raw.memory_stats.limit || 1;
    const networks = raw.networks || {};
    const netRx = Object.values(networks).reduce((a: number, n: any) => a + (n.rx_bytes ?? 0), 0) as number;
    const netTx = Object.values(networks).reduce((a: number, n: any) => a + (n.tx_bytes ?? 0), 0) as number;
    const blkIo = raw.blkio_stats?.io_service_bytes_recursive ?? [];
    const blkRead = blkIo.filter((b: any) => b.op === 'Read').reduce((a: number, b: any) => a + b.value, 0);
    const blkWrite = blkIo.filter((b: any) => b.op === 'Write').reduce((a: number, b: any) => a + b.value, 0);

    return {
      id,
      name: raw.name?.replace('/', '') ?? '',
      cpuPercent: parseFloat(cpuPercent.toFixed(2)),
      memoryUsage: memUsage,
      memoryLimit: memLimit,
      memoryPercent: parseFloat(((memUsage / memLimit) * 100).toFixed(2)),
      networkRx: netRx,
      networkTx: netTx,
      blockRead: blkRead,
      blockWrite: blkWrite,
      pids: raw.pids_stats?.current ?? 0,
    };
  }

  private parseDockerLogs(buf: Buffer): string[] {
    const lines: string[] = [];
    let offset = 0;
    while (offset < buf.length) {
      if (offset + 8 > buf.length) break;
      const size = buf.readUInt32BE(offset + 4);
      offset += 8;
      if (offset + size > buf.length) break;
      lines.push(buf.slice(offset, offset + size).toString('utf8').trimEnd());
      offset += size;
    }
    return lines;
  }

  onModuleDestroy() {
    (this.eventStream as any)?.destroy?.();
    for (const stream of this.statsStreams.values()) {
      (stream as any)?.destroy?.();
    }
  }
}

import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { MultiServerService } from '../multi-server/multi-server.service';
import { WsEvents } from '@hamyar-ops/shared';
import type {
  ContainerRegistryDto,
  RegistryImageDto,
  BuildRequestDto,
  BuildRecordDto,
  CreateRegistryDto,
} from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

// In-memory build records (no DB model for builds yet)
interface BuildRecord {
  id: string;
  appName: string;
  mode: string;
  registryId: string | null;
  serverId: string | null;
  tag: string | null;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  output: string;
  startedAt: Date;
  finishedAt: Date | null;
}

@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);
  private buildRecords = new Map<string, BuildRecord>();

  constructor(
    private prisma: PrismaService,
    @InjectQueue('registry') private registryQueue: Queue,
    private eventBus: DeployEventBus,
    @Inject(forwardRef(() => MultiServerService))
    private multiServer: MultiServerService,
  ) {}

  // ─── Encryption helpers ──────────────────────────────────────────────────────

  private getEncryptionKey(): Buffer {
    const raw =
      process.env.SECRETS_ENCRYPTION_KEY || 'hamyar-ops-default-key-32chars!!';
    return Buffer.from(raw, 'utf8').slice(0, 32);
  }

  encryptPassword(plain: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  }

  decryptPassword(enc: string): string {
    const [ivHex, encHex, tagHex] = enc.split(':');
    if (!ivHex || !encHex || !tagHex) throw new Error('Invalid encrypted value');
    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async listRegistries(): Promise<ContainerRegistryDto[]> {
    const regs = await this.prisma.containerRegistry.findMany({
      orderBy: { name: 'asc' },
    });
    return regs.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as any,
      url: r.url ?? null,
      username: r.username ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async getRegistry(id: string): Promise<ContainerRegistryDto> {
    const r = await this.prisma.containerRegistry.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Registry not found');
    return {
      id: r.id,
      name: r.name,
      type: r.type as any,
      url: r.url ?? null,
      username: r.username ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async createRegistry(dto: CreateRegistryDto): Promise<ContainerRegistryDto> {
    const encryptedPassword = dto.password
      ? this.encryptPassword(dto.password)
      : null;

    const r = await this.prisma.containerRegistry.create({
      data: {
        name: dto.name,
        type: dto.type,
        url: dto.url ?? null,
        username: dto.username ?? null,
        password: encryptedPassword,
      },
    });

    return {
      id: r.id,
      name: r.name,
      type: r.type as any,
      url: r.url ?? null,
      username: r.username ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async updateRegistry(
    id: string,
    dto: Partial<CreateRegistryDto>,
  ): Promise<ContainerRegistryDto> {
    const existing = await this.prisma.containerRegistry.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Registry not found');

    const encryptedPassword =
      dto.password !== undefined
        ? dto.password
          ? this.encryptPassword(dto.password)
          : null
        : undefined;

    const r = await this.prisma.containerRegistry.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        ...(encryptedPassword !== undefined
          ? { password: encryptedPassword }
          : {}),
      },
    });

    return {
      id: r.id,
      name: r.name,
      type: r.type as any,
      url: r.url ?? null,
      username: r.username ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async deleteRegistry(id: string): Promise<void> {
    const existing = await this.prisma.containerRegistry.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Registry not found');
    await this.prisma.containerRegistry.delete({ where: { id } });
  }

  // ─── Test connection ─────────────────────────────────────────────────────────

  async testConnection(id: string): Promise<{ ok: boolean; message: string }> {
    const r = await this.prisma.containerRegistry.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Registry not found');

    const registryUrl = r.url || 'https://index.docker.io/v1/';
    const username = r.username ?? '';
    let password = '';

    if (r.password) {
      try {
        password = this.decryptPassword(r.password);
      } catch {
        return { ok: false, message: 'Failed to decrypt stored password' };
      }
    }

    try {
      await execFileAsync('docker', [
        'login',
        registryUrl,
        '-u',
        username,
        '--password-stdin',
      ], {
        input: password,
      } as any);
      return { ok: true, message: 'Login successful' };
    } catch (err: any) {
      return { ok: false, message: err.stderr ?? err.message ?? 'Login failed' };
    }
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  async triggerBuild(dto: BuildRequestDto): Promise<{ buildId: string }> {
    const buildId = crypto.randomUUID();
    const record: BuildRecord = {
      id: buildId,
      appName: dto.appName,
      mode: dto.mode,
      registryId: dto.registryId ?? null,
      serverId: dto.serverId ?? null,
      tag: dto.tag ?? null,
      status: 'PENDING',
      output: '',
      startedAt: new Date(),
      finishedAt: null,
    };
    this.buildRecords.set(buildId, record);

    await this.registryQueue.add('build', { buildId, dto });
    return { buildId };
  }

  async executeBuild(buildId: string, dto: BuildRequestDto): Promise<void> {
    const record = this.buildRecords.get(buildId);
    if (record) {
      record.status = 'RUNNING';
    }

    const tag = dto.tag ?? dto.appName;
    const emit = (line: string) => {
      this.eventBus.emit(WsEvents.BUILD_LOG, {
        buildId,
        appName: dto.appName,
        line,
        stream: 'stdout',
      });
      if (record) record.output += line + '\n';
    };

    try {
      let registry: any = null;
      let password = '';

      if (dto.registryId) {
        registry = await this.prisma.containerRegistry.findUnique({
          where: { id: dto.registryId },
        });
        if (registry?.password) {
          try {
            password = this.decryptPassword(registry.password);
          } catch {
            emit('Warning: failed to decrypt registry password');
          }
        }
      }

      if (dto.mode === 'ci') {
        emit('CI mode: image already built by CI pipeline, skipping local build.');
        emit(`Using tag: ${tag}`);
      } else if (dto.mode === 'local') {
        emit(`Building locally: docker build -t ${tag} ${dto.contextPath || '.'}`);
        const { stdout, stderr } = await execFileAsync('docker', [
          'build',
          '-t',
          tag,
          dto.contextPath || '.',
          ...(dto.dockerfilePath ? ['-f', dto.dockerfilePath] : []),
        ]);
        [stdout, stderr]
          .filter(Boolean)
          .join('\n')
          .split('\n')
          .forEach(emit);
      } else if (dto.mode === 'remote') {
        if (!dto.serverId) throw new Error('Remote build requires serverId');
        emit(`Building remotely on server ${dto.serverId}...`);
        const cmd = [
          `docker build -t ${tag}`,
          dto.dockerfilePath ? `-f ${dto.dockerfilePath}` : '',
          dto.contextPath || '.',
        ]
          .filter(Boolean)
          .join(' ');
        const result = await this.multiServer.executeRemoteCommand(
          dto.serverId,
          cmd,
        );
        result.output.split('\n').forEach(emit);
        if (!result.success)
          throw new Error(result.error ?? 'Remote build failed');
      }

      // Push to registry if configured
      if (registry && dto.mode !== 'ci') {
        const registryHost =
          registry.type === 'dockerhub'
            ? ''
            : registry.url ?? '';

        const fullTag = registryHost
          ? `${registryHost}/${tag}`
          : tag;

        emit(`Pushing ${fullTag} to registry...`);

        if (password && registry.username) {
          await execFileAsync(
            'docker',
            [
              'login',
              registry.url || 'https://index.docker.io/v1/',
              '-u',
              registry.username,
              '--password-stdin',
            ],
            { input: password } as any,
          );
        }

        if (fullTag !== tag) {
          await execFileAsync('docker', ['tag', tag, fullTag]);
        }

        const pushResult = dto.serverId
          ? await this.multiServer.executeRemoteCommand(
              dto.serverId,
              `docker push ${fullTag}`,
            )
          : await execFileAsync('docker', ['push', fullTag]).then((r) => ({
              success: true,
              output: [r.stdout, r.stderr].filter(Boolean).join('\n'),
            }));

        if ('output' in pushResult) {
          pushResult.output.split('\n').forEach(emit);
        }
      }

      if (record) {
        record.status = 'SUCCESS';
        record.finishedAt = new Date();
        record.tag = tag;
      }

      this.eventBus.emit(WsEvents.BUILD_DONE, {
        buildId,
        appName: dto.appName,
        status: 'SUCCESS',
        tag,
      });
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      emit(`ERROR: ${errMsg}`);

      if (record) {
        record.status = 'FAILED';
        record.finishedAt = new Date();
      }

      this.eventBus.emit(WsEvents.BUILD_DONE, {
        buildId,
        appName: dto.appName,
        status: 'FAILED',
        tag: null,
      });

      this.logger.error(`Build ${buildId} failed: ${errMsg}`);
    }
  }

  getBuildRecord(buildId: string): BuildRecordDto | null {
    const r = this.buildRecords.get(buildId);
    if (!r) return null;
    return {
      id: r.id,
      appName: r.appName,
      mode: r.mode as any,
      registryId: r.registryId,
      serverId: r.serverId,
      tag: r.tag,
      status: r.status,
      output: r.output,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }

  getRecentBuilds(): BuildRecordDto[] {
    return [...this.buildRecords.values()]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        appName: r.appName,
        mode: r.mode as any,
        registryId: r.registryId,
        serverId: r.serverId,
        tag: r.tag,
        status: r.status,
        output: r.output,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      }));
  }

  // ─── Image listing ───────────────────────────────────────────────────────────

  async listImages(registryId: string): Promise<RegistryImageDto[]> {
    const r = await this.prisma.containerRegistry.findUnique({
      where: { id: registryId },
    });
    if (!r) throw new NotFoundException('Registry not found');

    let password = '';
    if (r.password) {
      try {
        password = this.decryptPassword(r.password);
      } catch {
        this.logger.warn('Failed to decrypt registry password for image listing');
      }
    }

    try {
      if (r.type === 'dockerhub') {
        return await this.listDockerHubImages(r.username ?? '', password);
      } else if (r.type === 'ghcr') {
        return await this.listGhcrImages(r.username ?? '', password);
      } else {
        return await this.listSelfHostedImages(r.url ?? '', r.username ?? '', password);
      }
    } catch (err: any) {
      this.logger.error(`Failed to list images for registry ${registryId}: ${err.message}`);
      return [];
    }
  }

  private async listDockerHubImages(
    username: string,
    password: string,
  ): Promise<RegistryImageDto[]> {
    // Get auth token
    const authRes = await fetch(
      `https://hub.docker.com/v2/users/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      },
    );
    if (!authRes.ok) throw new Error(`DockerHub auth failed: ${authRes.status}`);
    const { token } = (await authRes.json()) as { token: string };

    const repoRes = await fetch(
      `https://hub.docker.com/v2/repositories/${username}/?page_size=25`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!repoRes.ok) throw new Error(`DockerHub repo list failed: ${repoRes.status}`);
    const { results } = (await repoRes.json()) as { results: any[] };

    const images: RegistryImageDto[] = [];
    for (const repo of results) {
      images.push({
        name: repo.name,
        tag: repo.last_updated ? 'latest' : '',
        pushedAt: repo.last_updated ?? null,
      });
    }
    return images;
  }

  private async listGhcrImages(
    username: string,
    token: string,
  ): Promise<RegistryImageDto[]> {
    const res = await fetch(
      `https://ghcr.io/v2/${username}/tags/list`,
      {
        headers: {
          Authorization: `Bearer ${Buffer.from(token).toString('base64')}`,
        },
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { name?: string; tags?: string[] };
    return (data.tags ?? []).map((tag) => ({
      name: data.name ?? username,
      tag,
    }));
  }

  private async listSelfHostedImages(
    url: string,
    username: string,
    password: string,
  ): Promise<RegistryImageDto[]> {
    const base = url.replace(/\/$/, '');
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const headers: Record<string, string> = {};
    if (username) {
      headers.Authorization = `Basic ${auth}`;
    }

    const catalogRes = await fetch(`${base}/v2/_catalog`, { headers });
    if (!catalogRes.ok) return [];
    const { repositories = [] } = (await catalogRes.json()) as { repositories?: string[] };

    const images: RegistryImageDto[] = [];
    for (const repo of repositories.slice(0, 25)) {
      try {
        const tagsRes = await fetch(`${base}/v2/${repo}/tags/list`, { headers });
        if (!tagsRes.ok) continue;
        const { tags = [] } = (await tagsRes.json()) as { tags?: string[] };
        for (const tag of tags) {
          images.push({ name: repo, tag });
        }
      } catch {
        // skip individual repo errors
      }
    }
    return images;
  }

  // ─── Pull on server ──────────────────────────────────────────────────────────

  async pullOnServer(serverId: string, image: string): Promise<{ ok: boolean; output: string }> {
    const result = await this.multiServer.executeRemoteCommand(
      serverId,
      `docker pull ${image}`,
    );
    return { ok: result.success, output: result.output };
  }
}

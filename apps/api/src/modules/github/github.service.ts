import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { EventsService } from '../events/events.service';
import { WsEvents } from '@hamyar-ops/shared';
import type {
  GithubConnectionDto,
  GithubRepoDto,
  GithubBranchDto,
  GithubDeployDto,
} from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: DeployEventBus,
    private eventsService: EventsService,
  ) {}

  // ─── Encryption (AES-256-GCM, copied from registry.service.ts) ──────────────

  private getEncryptionKey(): Buffer {
    const raw =
      process.env.SECRETS_ENCRYPTION_KEY || 'hamyar-ops-default-key-32chars!!';
    return Buffer.from(raw, 'utf8').slice(0, 32);
  }

  private encrypt(plain: string): string {
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

  private decrypt(enc: string): string {
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

  // ─── OAuth ───────────────────────────────────────────────────────────────────

  isConfigured(): boolean {
    return !!(
      process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET &&
      process.env.GITHUB_CALLBACK_URL
    );
  }

  getAuthUrl(userId: string): { authUrl: string; configured: boolean } {
    if (!this.isConfigured()) {
      return { configured: false, authUrl: '' };
    }
    const clientId = process.env.GITHUB_CLIENT_ID!;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL!;
    const authUrl =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=repo,user` +
      `&state=${encodeURIComponent(userId)}`;
    return { configured: true, authUrl };
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<GithubConnectionDto> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL;

    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
      },
    );

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      throw new Error(`GitHub OAuth failed: ${tokenData.error ?? 'no token'}`);
    }

    const token = tokenData.access_token;

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    const userData = (await userRes.json()) as {
      id: number;
      login: string;
      avatar_url: string;
    };

    const encryptedToken = this.encrypt(token);
    const userId = decodeURIComponent(state);

    const conn = await this.prisma.githubConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: encryptedToken,
        githubUserId: String(userData.id),
        githubLogin: userData.login,
        avatarUrl: userData.avatar_url ?? null,
      },
      update: {
        accessToken: encryptedToken,
        githubUserId: String(userData.id),
        githubLogin: userData.login,
        avatarUrl: userData.avatar_url ?? null,
      },
    });

    return {
      connected: true,
      githubLogin: conn.githubLogin,
      avatarUrl: conn.avatarUrl ?? undefined,
      githubUserId: conn.githubUserId,
      createdAt: conn.createdAt.toISOString(),
    };
  }

  async getConnection(userId: string): Promise<GithubConnectionDto> {
    const conn = await this.prisma.githubConnection.findUnique({
      where: { userId },
    });
    if (!conn) return { connected: false };
    return {
      connected: true,
      githubLogin: conn.githubLogin,
      avatarUrl: conn.avatarUrl ?? undefined,
      githubUserId: conn.githubUserId,
      createdAt: conn.createdAt.toISOString(),
    };
  }

  async disconnect(userId: string): Promise<void> {
    await this.prisma.githubConnection.deleteMany({ where: { userId } });
  }

  // ─── Repos / branches ────────────────────────────────────────────────────────

  async listRepos(userId: string): Promise<GithubRepoDto[]> {
    const conn = await this.prisma.githubConnection.findUnique({
      where: { userId },
    });
    if (!conn) throw new NotFoundException('GitHub not connected');

    const token = this.decrypt(conn.accessToken);

    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&type=all',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const repos = (await res.json()) as any[];
    return repos.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      name: r.name,
      owner: r.owner?.login ?? '',
      description: r.description ?? null,
      private: r.private,
      fork: r.fork,
      defaultBranch: r.default_branch,
      htmlUrl: r.html_url,
      cloneUrl: r.clone_url,
      updatedAt: r.updated_at,
    }));
  }

  async getRepoBranches(
    userId: string,
    owner: string,
    repo: string,
  ): Promise<GithubBranchDto[]> {
    const conn = await this.prisma.githubConnection.findUnique({
      where: { userId },
    });
    if (!conn) throw new NotFoundException('GitHub not connected');

    const token = this.decrypt(conn.accessToken);

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const branches = (await res.json()) as any[];
    return branches.map((b) => ({
      name: b.name,
      commit: b.commit?.sha ?? '',
      protected: b.protected ?? false,
    }));
  }

  // ─── Deploy ──────────────────────────────────────────────────────────────────

  async deployFromGithub(
    userId: string,
    dto: GithubDeployDto,
  ): Promise<{ deployId: string }> {
    const conn = await this.prisma.githubConnection.findUnique({
      where: { userId },
    });
    if (!conn) throw new NotFoundException('GitHub not connected');

    const token = this.decrypt(conn.accessToken);

    const server = await this.prisma.managedServer.findUnique({
      where: { id: dto.serverId },
      include: { sshKey: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const deployId = crypto.randomUUID();

    // Fire-and-forget async deploy
    this.runDeploy(deployId, userId, dto, token, server).catch((err) => {
      this.logger.error(`Deploy ${deployId} crashed: ${err.message}`);
    });

    return { deployId };
  }

  private async runDeploy(
    deployId: string,
    userId: string,
    dto: GithubDeployDto,
    token: string,
    server: any,
  ): Promise<void> {
    const { repoFullName, branch, deployPath, appName, startCmd } = dto;
    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `ssh_github_${deployId}`);

    const emit = (line: string) => {
      this.eventBus.emit(WsEvents.GITHUB_DEPLOY_LOG, { deployId, line });
    };

    const ssh = async (cmd: string): Promise<string> => {
      const sshArgs = server.sshKeyId
        ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port}`
        : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${server.username}@${server.host} -p ${server.port}`;

      const { stdout, stderr } = await execFileAsync('bash', [
        '-c',
        `${sshArgs} "${cmd.replace(/"/g, '\\"')}"`,
      ]).catch((e: any) => ({ stdout: e.stdout || '', stderr: e.stderr || e.message || '' }));

      if (stderr) emit(`[stderr] ${stderr}`);
      return stdout;
    };

    try {
      if (server.sshKeyId && server.sshKey) {
        fs.writeFileSync(keyFile, server.sshKey.privateKey, { mode: 0o600 });
      }

      emit(`Starting deployment of ${repoFullName}@${branch} to ${server.name}:${deployPath}`);

      // Check if deploy path exists and is a git repo
      const checkResult = await ssh(
        `test -d ${deployPath} && cd ${deployPath} && git rev-parse --is-inside-work-tree 2>/dev/null && echo exists_git || echo not_git_or_missing`,
      );
      const isGitRepo = checkResult.trim() === 'exists_git';

      if (isGitRepo) {
        emit('Repository exists, pulling latest changes...');
        const pullOutput = await ssh(
          `cd ${deployPath} && git fetch origin && git checkout ${branch} && git pull origin ${branch} 2>&1`,
        );
        pullOutput.split('\n').filter(Boolean).forEach(emit);
      } else {
        emit('Cloning repository...');
        const cloneUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`;
        const cloneOutput = await ssh(
          `git clone --branch ${branch} ${cloneUrl} ${deployPath} 2>&1`,
        );
        cloneOutput.split('\n').filter(Boolean).forEach(emit);
      }

      // Detect package manager and install deps
      emit('Detecting package manager...');
      const lockCheck = await ssh(
        `ls ${deployPath}/pnpm-lock.yaml ${deployPath}/yarn.lock 2>/dev/null | head -1`,
      );

      let installCmd: string;
      if (lockCheck.includes('pnpm-lock.yaml')) {
        installCmd = `cd ${deployPath} && pnpm install --frozen-lockfile 2>&1`;
        emit('Using pnpm...');
      } else if (lockCheck.includes('yarn.lock')) {
        installCmd = `cd ${deployPath} && yarn install --frozen-lockfile 2>&1`;
        emit('Using yarn...');
      } else {
        installCmd = `cd ${deployPath} && npm ci 2>&1`;
        emit('Using npm...');
      }

      emit('Installing dependencies...');
      const installOutput = await ssh(installCmd);
      installOutput.split('\n').filter(Boolean).forEach(emit);

      // Build
      emit('Running build...');
      const buildOutput = await ssh(
        `cd ${deployPath} && npm run build --if-present 2>&1`,
      );
      buildOutput.split('\n').filter(Boolean).forEach(emit);

      // Start / reload with PM2
      emit('Starting/reloading with PM2...');
      const pm2Output = await ssh(
        `cd ${deployPath} && pm2 reload ${appName} --update-env 2>&1 || pm2 start ${startCmd || 'npm start'} --name ${appName} 2>&1`,
      );
      pm2Output.split('\n').filter(Boolean).forEach(emit);

      emit('Deployment completed successfully.');
      this.eventBus.emit(WsEvents.GITHUB_DEPLOY_DONE, {
        deployId,
        status: 'SUCCESS',
      });

      await this.eventsService.create({
        type: 'GITHUB_DEPLOY',
        title: `Deployed ${repoFullName}@${branch}`,
        description: `Deployed to ${server.name}:${deployPath}`,
        metadata: { deployId, repoFullName, branch, serverId: dto.serverId, appName },
        serverId: dto.serverId,
        serverName: server.name,
        appName,
        userId,
        severity: 'SUCCESS',
      });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      emit(`ERROR: ${msg}`);
      this.eventBus.emit(WsEvents.GITHUB_DEPLOY_DONE, {
        deployId,
        status: 'FAILED',
      });

      await this.eventsService.create({
        type: 'GITHUB_DEPLOY',
        title: `Deploy failed: ${repoFullName}@${branch}`,
        description: msg,
        metadata: { deployId, repoFullName, branch, serverId: dto.serverId, appName },
        serverId: dto.serverId,
        serverName: server.name,
        appName,
        userId,
        severity: 'ERROR',
      });

      this.logger.error(`Deploy ${deployId} failed: ${msg}`);
    } finally {
      try {
        if (server.sshKeyId && fs.existsSync(keyFile)) {
          fs.unlinkSync(keyFile);
        }
      } catch {}
    }
  }
}

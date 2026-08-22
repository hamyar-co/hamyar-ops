import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { WsEvents } from '@hamyar-ops/shared';
import type {
  AnsiblePlaybookDto,
  AnsibleJobDto,
  CreateAnsiblePlaybookDto,
  RunAnsiblePlaybookDto,
  DriftReport,
  DriftCheck,
} from '@hamyar-ops/shared';

const BOOTSTRAP_CONTENT = `---
- name: Bootstrap server
  hosts: all
  become: yes
  tasks:
    - name: Update apt cache
      apt: update_cache=yes cache_valid_time=3600
    - name: Install dependencies
      apt: name={{ item }} state=present
      loop: [curl, git, nginx, ufw, build-essential]
    - name: Install Node.js 22 via NodeSource
      shell: |
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
      args: { executable: /bin/bash }
    - name: Install PM2
      npm: name=pm2 global=yes
    - name: Install Docker
      shell: curl -fsSL https://get.docker.com | sh
      args: { executable: /bin/bash }
    - name: Enable UFW
      ufw: state=enabled policy=deny
    - name: Allow SSH
      ufw: rule=allow port=22 proto=tcp
    - name: Allow HTTP
      ufw: rule=allow port=80 proto=tcp
    - name: Allow HTTPS
      ufw: rule=allow port=443 proto=tcp
    - name: Enable Nginx
      service: name=nginx state=started enabled=yes
`;

const DRIFT_CHECK_CONTENT = `---
- name: Drift check
  hosts: all
  tasks:
    - name: Check Node.js version
      command: node --version
      register: node_ver
      ignore_errors: yes
    - name: Check PM2
      command: pm2 --version
      register: pm2_ver
      ignore_errors: yes
    - name: Check Docker
      command: docker --version
      register: docker_ver
      ignore_errors: yes
    - name: Check Nginx
      command: nginx -v
      register: nginx_ver
      ignore_errors: yes
    - name: Report drift
      debug:
        msg: "DRIFT:nodejs|>=22|{{ node_ver.stdout | default('NOT_INSTALLED') }}|{{ 'false' if '22' in (node_ver.stdout | default('')) else 'true' }}"
    - debug:
        msg: "DRIFT:pm2|installed|{{ pm2_ver.stdout | default('NOT_INSTALLED') }}|{{ 'false' if pm2_ver.rc == 0 else 'true' }}"
    - debug:
        msg: "DRIFT:docker|installed|{{ docker_ver.stdout | default('NOT_INSTALLED') }}|{{ 'false' if docker_ver.rc == 0 else 'true' }}"
    - debug:
        msg: "DRIFT:nginx|installed|{{ nginx_ver.stderr | default(nginx_ver.stdout) | default('NOT_INSTALLED') }}|{{ 'false' if nginx_ver.rc == 0 else 'true' }}"
`;

const DEPLOY_APP_CONTENT = `---
- name: Deploy application
  hosts: all
  vars:
    app_name: "{{ app_name | default('app') }}"
    deploy_path: "{{ deploy_path | default('/opt/app') }}"
    branch: "{{ branch | default('main') }}"
  tasks:
    - name: Git pull latest
      git: repo=origin dest={{ deploy_path }} version={{ branch }} force=yes
      ignore_errors: yes
    - name: Install dependencies
      command: npm install --production
      args: { chdir: "{{ deploy_path }}" }
      ignore_errors: yes
    - name: Reload PM2
      command: pm2 reload {{ app_name }} --update-env
      ignore_errors: yes
`;

const ROTATE_KEYS_CONTENT = `---
- name: Rotate SSH keys
  hosts: all
  become: yes
  vars:
    new_public_key: "{{ new_public_key }}"
    remove_old_key: "{{ remove_old_key | default('') }}"
  tasks:
    - name: Add new authorized key
      authorized_key:
        user: "{{ ansible_user }}"
        key: "{{ new_public_key }}"
        state: present
    - name: Remove old key (if specified)
      authorized_key:
        user: "{{ ansible_user }}"
        key: "{{ remove_old_key }}"
        state: absent
      when: remove_old_key != ''
`;

@Injectable()
export class AnsibleService {
  private readonly logger = new Logger(AnsibleService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('ansible') private ansibleQueue: Queue,
    private eventBus: DeployEventBus,
  ) {}

  // ─── Playbooks ────────────────────────────────────────────────────────────

  async listPlaybooks(): Promise<AnsiblePlaybookDto[]> {
    const rows = await this.prisma.ansiblePlaybook.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map(this.mapPlaybook);
  }

  async getPlaybook(id: string): Promise<AnsiblePlaybookDto> {
    const row = await this.prisma.ansiblePlaybook.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Playbook not found');
    return this.mapPlaybook(row);
  }

  async createPlaybook(dto: CreateAnsiblePlaybookDto): Promise<AnsiblePlaybookDto> {
    const row = await this.prisma.ansiblePlaybook.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        content: dto.content,
        targetTags: dto.targetTags ?? [],
        variables: dto.variables ? (dto.variables as any) : undefined,
        builtIn: false,
      },
    });
    return this.mapPlaybook(row);
  }

  async updatePlaybook(
    id: string,
    dto: Partial<CreateAnsiblePlaybookDto>,
  ): Promise<AnsiblePlaybookDto> {
    const existing = await this.prisma.ansiblePlaybook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Playbook not found');
    const row = await this.prisma.ansiblePlaybook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.targetTags !== undefined && { targetTags: dto.targetTags }),
        ...(dto.variables !== undefined && { variables: dto.variables as any }),
      },
    });
    return this.mapPlaybook(row);
  }

  async deletePlaybook(id: string): Promise<void> {
    const existing = await this.prisma.ansiblePlaybook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Playbook not found');
    if (existing.builtIn) {
      throw new BadRequestException('Cannot delete a built-in playbook');
    }
    await this.prisma.ansiblePlaybook.delete({ where: { id } });
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────────

  async runPlaybook(
    playbookId: string,
    dto: RunAnsiblePlaybookDto,
    userId?: string,
  ): Promise<AnsibleJobDto> {
    const playbook = await this.prisma.ansiblePlaybook.findUnique({ where: { id: playbookId } });
    if (!playbook) throw new NotFoundException('Playbook not found');

    const job = await this.prisma.ansibleJob.create({
      data: {
        playbookId,
        serverIds: dto.serverIds,
        status: 'PENDING',
        triggeredBy: userId ?? null,
      },
    });

    // Pass variables via queue data so they don't need a DB column
    await this.ansibleQueue.add(
      'run',
      { jobId: job.id, variables: dto.variables ?? null },
      { jobId: job.id },
    );

    return this.mapJob(job, playbook.name);
  }

  async getJob(id: string): Promise<AnsibleJobDto> {
    const row = await this.prisma.ansibleJob.findUnique({
      where: { id },
      include: { playbook: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Job not found');
    return this.mapJob(row, row.playbook.name);
  }

  async listJobs(playbookId?: string): Promise<AnsibleJobDto[]> {
    const rows = await this.prisma.ansibleJob.findMany({
      where: playbookId ? { playbookId } : undefined,
      include: { playbook: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.mapJob(r, r.playbook.name));
  }

  async getDriftReport(serverId: string): Promise<AnsibleJobDto> {
    const driftPlaybook = await this.prisma.ansiblePlaybook.findFirst({
      where: { name: 'drift-check', builtIn: true },
    });
    if (!driftPlaybook) {
      throw new NotFoundException('Built-in drift-check playbook not found');
    }
    return this.runPlaybook(driftPlaybook.id, { serverIds: [serverId] });
  }

  // ─── Execution (called by processor) ──────────────────────────────────────

  async executeJob(jobId: string, variables?: Record<string, string>): Promise<void> {
    const tempFiles: string[] = [];

    try {
      // 1. Mark RUNNING
      await this.prisma.ansibleJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });

      // 2. Load job + playbook
      const job = await this.prisma.ansibleJob.findUnique({
        where: { id: jobId },
        include: { playbook: true },
      });
      if (!job) throw new Error(`Job ${jobId} not found`);

      const { playbook } = job;

      // 3. Load servers
      const servers = await this.prisma.managedServer.findMany({
        where: { id: { in: job.serverIds } },
        include: { sshKey: true },
      });

      if (servers.length === 0) {
        throw new Error('No servers found for job');
      }

      // 4. Build inventory
      const inventoryLines = ['[all]'];
      const keyFiles: string[] = [];

      for (const server of servers) {
        let keyPath = '';
        if (server.sshKeyId && server.sshKey) {
          keyPath = path.join(os.tmpdir(), `ansible-key-${jobId}-${server.id}`);
          fs.writeFileSync(keyPath, server.sshKey.privateKey, { mode: 0o600 });
          keyFiles.push(keyPath);
          tempFiles.push(keyPath);
          inventoryLines.push(
            `${server.name} ansible_host=${server.host} ansible_port=${server.port} ansible_user=${server.username} ansible_ssh_private_key_file=${keyPath} ansible_ssh_common_args='-o StrictHostKeyChecking=no'`,
          );
        } else {
          // password auth — pass ansible_ssh_pass
          const sshPass = (server as any).password ?? '';
          inventoryLines.push(
            `${server.name} ansible_host=${server.host} ansible_port=${server.port} ansible_user=${server.username} ansible_ssh_pass=${sshPass} ansible_ssh_common_args='-o StrictHostKeyChecking=no'`,
          );
        }
      }

      // 5. Write temp files
      const invPath = path.join(os.tmpdir(), `ansible-inv-${jobId}`);
      const pbPath = path.join(os.tmpdir(), `ansible-pb-${jobId}.yml`);
      tempFiles.push(invPath, pbPath);

      fs.writeFileSync(invPath, inventoryLines.join('\n') + '\n');
      fs.writeFileSync(pbPath, playbook.content);

      // 6. Build ansible-playbook args
      const args = ['-i', invPath, pbPath];
      const extraVars: Record<string, string> = { ...(variables ?? {}) };
      if (Object.keys(extraVars).length > 0) {
        args.push('--extra-vars', JSON.stringify(extraVars));
      }

      // 7. Spawn and stream output
      const outputLines: string[] = [];

      await new Promise<void>((resolve, reject) => {
        const child = spawn('ansible-playbook', args, {
          env: { ...process.env, ANSIBLE_FORCE_COLOR: '0' },
        });

        const emitLine = (line: string, stream: 'stdout' | 'stderr') => {
          outputLines.push(line);
          this.eventBus.emit(WsEvents.ANSIBLE_LOG, {
            jobId,
            playbookId: playbook.id,
            line,
            stream,
          });
        };

        const processStream = (data: Buffer, stream: 'stdout' | 'stderr') => {
          const text = data.toString();
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.trim()) emitLine(line, stream);
          }
        };

        child.stdout.on('data', (d) => processStream(d, 'stdout'));
        child.stderr.on('data', (d) => processStream(d, 'stderr'));

        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ansible-playbook exited with code ${code}`));
        });

        child.on('error', reject);
      });

      // 8. Parse drift output if applicable
      let driftReport: DriftReport[] | null = null;
      if (playbook.name === 'drift-check') {
        const driftChecks: DriftCheck[] = [];
        for (const line of outputLines) {
          const match = line.match(/DRIFT:([^|]+)\|([^|]+)\|([^|]+)\|(true|false)/);
          if (match) {
            driftChecks.push({
              name: match[1],
              expected: match[2],
              actual: match[3],
              drift: match[4] === 'true',
            });
          }
        }
        if (driftChecks.length > 0) {
          driftReport = servers.map((server) => ({
            serverId: server.id,
            serverName: server.name,
            checkedAt: new Date().toISOString(),
            checks: driftChecks,
            hasDrift: driftChecks.some((c) => c.drift),
          }));
        }
      }

      // 9. Mark SUCCESS
      const fullOutput = outputLines.join('\n');
      await this.prisma.ansibleJob.update({
        where: { id: jobId },
        data: {
          status: 'SUCCESS',
          output: fullOutput,
          finishedAt: new Date(),
          ...(driftReport ? { driftReport: driftReport as any } : {}),
        },
      });

      this.eventBus.emit(WsEvents.ANSIBLE_DONE, {
        jobId,
        playbookId: playbook.id,
        status: 'SUCCESS',
        driftReport,
      });
    } catch (err: any) {
      this.logger.error(`Ansible job ${jobId} failed: ${err.message}`);
      await this.prisma.ansibleJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', finishedAt: new Date() },
      });

      // Try to get playbookId for the event
      try {
        const job = await this.prisma.ansibleJob.findUnique({ where: { id: jobId } });
        if (job) {
          this.eventBus.emit(WsEvents.ANSIBLE_DONE, {
            jobId,
            playbookId: job.playbookId,
            status: 'FAILED',
            driftReport: null,
          });
        }
      } catch {}

      throw err;
    } finally {
      // Cleanup temp files
      for (const f of tempFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
    }
  }

  // ─── Seed built-in playbooks ───────────────────────────────────────────────

  async seedBuiltInPlaybooks(): Promise<void> {
    const builtIns = [
      {
        name: 'bootstrap',
        description: 'Install Node.js 22, PM2, Docker, Nginx, UFW',
        content: BOOTSTRAP_CONTENT,
      },
      {
        name: 'drift-check',
        description: 'Check installed versions and report configuration drift',
        content: DRIFT_CHECK_CONTENT,
      },
      {
        name: 'deploy-app',
        description: 'Git pull, npm install, pm2 reload',
        content: DEPLOY_APP_CONTENT,
      },
      {
        name: 'rotate-keys',
        description: 'Add new authorized_key and optionally remove old one',
        content: ROTATE_KEYS_CONTENT,
      },
    ];

    for (const pb of builtIns) {
      const existing = await this.prisma.ansiblePlaybook.findUnique({
        where: { name: pb.name },
      });
      if (!existing) {
        await this.prisma.ansiblePlaybook.create({
          data: {
            name: pb.name,
            description: pb.description,
            content: pb.content,
            builtIn: true,
            targetTags: [],
          },
        });
        this.logger.log(`Seeded built-in playbook: ${pb.name}`);
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private mapPlaybook(row: any): AnsiblePlaybookDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      content: row.content,
      targetTags: row.targetTags ?? [],
      variables: row.variables ?? null,
      builtIn: row.builtIn,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapJob(row: any, playbookName: string): AnsibleJobDto {
    return {
      id: row.id,
      playbookId: row.playbookId,
      playbookName,
      serverIds: row.serverIds ?? [],
      status: row.status as AnsibleJobDto['status'],
      output: row.output ?? null,
      driftReport: row.driftReport ?? null,
      triggeredBy: row.triggeredBy ?? null,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }
}

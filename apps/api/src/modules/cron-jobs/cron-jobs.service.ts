import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CronJobDto, CreateCronJobDto, UpdateCronJobDto, CronRunResultDto } from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(
    @InjectQueue('cron-jobs') private cronQueue: Queue,
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  private toDto(job: any, serverName?: string | null): CronJobDto {
    return {
      id: job.id,
      serverId: job.serverId ?? null,
      serverName: serverName ?? null,
      title: job.title,
      command: job.command,
      cronExpression: job.cronExpression,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt ? job.lastRunAt.toISOString() : null,
      lastRunOutput: job.lastRunOutput ?? null,
      lastRunStatus: (job.lastRunStatus as 'SUCCESS' | 'FAILED' | null) ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private jobKey(id: string) {
    return `cron-job:${id}`;
  }

  async list(serverId?: string): Promise<CronJobDto[]> {
    const jobs = await this.prisma.cronJob.findMany({
      where: serverId !== undefined ? { serverId: serverId || null } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    // Fetch server names for jobs that have a serverId
    const serverIds = [...new Set(jobs.map((j) => j.serverId).filter(Boolean))] as string[];
    const servers =
      serverIds.length > 0
        ? await this.prisma.managedServer.findMany({
            where: { id: { in: serverIds } },
            select: { id: true, name: true },
          })
        : [];
    const serverMap = new Map<string, string>(servers.map((s) => [s.id, s.name]));

    return jobs.map((j) => this.toDto(j, j.serverId ? serverMap.get(j.serverId) : null));
  }

  async get(id: string): Promise<CronJobDto> {
    const job = await this.prisma.cronJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Cron job not found');

    let serverName: string | null = null;
    if (job.serverId) {
      const server = await this.prisma.managedServer.findUnique({
        where: { id: job.serverId },
        select: { name: true },
      });
      serverName = server?.name ?? null;
    }

    return this.toDto(job, serverName);
  }

  async create(dto: CreateCronJobDto): Promise<CronJobDto> {
    const job = await this.prisma.cronJob.create({
      data: {
        serverId: dto.serverId ?? null,
        title: dto.title,
        command: dto.command,
        cronExpression: dto.cronExpression,
        enabled: dto.enabled ?? true,
      },
    });

    if (dto.serverId) {
      // Add to remote server's crontab via SSH
      await this.addRemoteCrontabEntry(dto.serverId, job.id, job.title, job.cronExpression, job.command);
    } else if (job.enabled) {
      // Add BullMQ repeatable job for ops server
      await this.cronQueue.add(
        'run',
        { jobId: job.id },
        {
          repeat: { pattern: job.cronExpression },
          jobId: this.jobKey(job.id),
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      );
    }

    await this.events.create({
      type: 'CRON_CREATED',
      title: `Cron job created: ${job.title}`,
      description: `Expression: ${job.cronExpression}, Command: ${job.command}`,
      severity: 'INFO',
    });

    return this.toDto(job, null);
  }

  async update(id: string, dto: UpdateCronJobDto): Promise<CronJobDto> {
    const existing = await this.prisma.cronJob.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cron job not found');

    const expressionChanged =
      dto.cronExpression !== undefined && dto.cronExpression !== existing.cronExpression;
    const commandChanged = dto.command !== undefined && dto.command !== existing.command;
    const enabledChanged = dto.enabled !== undefined && dto.enabled !== existing.enabled;

    // If the command or expression changed for a remote server, update crontab
    if (existing.serverId && (expressionChanged || commandChanged)) {
      // Remove old entry
      await this.removeRemoteCrontabEntry(existing.serverId, existing.id);
      // Add new entry with updated values
      const newExpression = dto.cronExpression ?? existing.cronExpression;
      const newCommand = dto.command ?? existing.command;
      const newTitle = dto.title ?? existing.title;
      await this.addRemoteCrontabEntry(existing.serverId, id, newTitle, newExpression, newCommand);
    }

    // If enabled toggled on a remote server, handle crontab commenting
    if (existing.serverId && enabledChanged) {
      if (dto.enabled) {
        // Re-add with current (or new) values
        const newExpression = dto.cronExpression ?? existing.cronExpression;
        const newCommand = dto.command ?? existing.command;
        const newTitle = dto.title ?? existing.title;
        await this.removeRemoteCrontabEntry(existing.serverId, id);
        await this.addRemoteCrontabEntry(existing.serverId, id, newTitle, newExpression, newCommand);
      } else {
        // Remove from crontab (keep DB record but no active entry)
        await this.removeRemoteCrontabEntry(existing.serverId, id);
      }
    }

    // For ops server BullMQ jobs
    if (!existing.serverId) {
      if (expressionChanged || commandChanged) {
        // Remove old repeatable job and re-add with new config
        await this.removeQueueJob(id);
        const isEnabled = dto.enabled ?? existing.enabled;
        if (isEnabled) {
          const newExpression = dto.cronExpression ?? existing.cronExpression;
          await this.cronQueue.add(
            'run',
            { jobId: id },
            {
              repeat: { pattern: newExpression },
              jobId: this.jobKey(id),
              removeOnComplete: 10,
              removeOnFail: 10,
            },
          );
        }
      } else if (enabledChanged) {
        if (dto.enabled) {
          await this.cronQueue.add(
            'run',
            { jobId: id },
            {
              repeat: { pattern: existing.cronExpression },
              jobId: this.jobKey(id),
              removeOnComplete: 10,
              removeOnFail: 10,
            },
          );
        } else {
          await this.removeQueueJob(id);
        }
      }
    }

    const updated = await this.prisma.cronJob.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.command !== undefined && { command: dto.command }),
        ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    });

    return this.toDto(updated, null);
  }

  async delete(id: string): Promise<void> {
    const job = await this.prisma.cronJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Cron job not found');

    if (job.serverId) {
      await this.removeRemoteCrontabEntry(job.serverId, id);
    } else {
      await this.removeQueueJob(id);
    }

    await this.prisma.cronJob.delete({ where: { id } });

    await this.events.create({
      type: 'CRON_DELETED',
      title: `Cron job deleted: ${job.title}`,
      severity: 'INFO',
    });
  }

  async toggle(id: string, enabled: boolean): Promise<CronJobDto> {
    return this.update(id, { enabled });
  }

  async runNow(id: string): Promise<CronRunResultDto> {
    const job = await this.prisma.cronJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Cron job not found');

    const start = Date.now();

    if (job.serverId) {
      // Execute via SSH on managed server
      const server = await this.prisma.managedServer.findUnique({ where: { id: job.serverId } });
      if (!server) throw new NotFoundException('Server not found');

      const tempDir = os.tmpdir();
      const keyFile = path.join(tempDir, `ssh_cron_key_${Date.now()}`);

      try {
        if (server.sshKeyId) {
          const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
          if (sshKey) {
            fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
          }
        }

        const sshCmd = server.sshKeyId
          ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} "${job.command.replace(/"/g, '\\"')}"`
          : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${server.username}@${server.host} -p ${server.port} "${job.command.replace(/"/g, '\\"')}"`;

        let output = '';
        let exitCode = 0;

        try {
          const result = await execFileAsync('bash', ['-c', sshCmd]);
          output = (result.stdout || '').trim();
        } catch (e: any) {
          output = ((e.stdout || '') + (e.stderr || e.message || '')).trim();
          exitCode = e.exitCode ?? -1;
        }

        const duration = Date.now() - start;
        const status = exitCode === 0 ? 'SUCCESS' : 'FAILED';

        await this.prisma.cronJob.update({
          where: { id },
          data: { lastRunAt: new Date(), lastRunOutput: output, lastRunStatus: status },
        });

        await this.events.create({
          type: 'CRON_RUN',
          title: `Cron job run: ${job.title}`,
          description: `Status: ${status}, Duration: ${duration}ms`,
          severity: status === 'SUCCESS' ? 'SUCCESS' : 'ERROR',
        });

        return { jobId: id, output, exitCode, duration };
      } finally {
        try {
          if (server.sshKeyId && fs.existsSync(keyFile)) {
            fs.unlinkSync(keyFile);
          }
        } catch {}
      }
    } else {
      // Execute locally on ops server
      let output = '';
      let exitCode = 0;

      try {
        const result = await execFileAsync('bash', ['-c', job.command]);
        output = (result.stdout || '').trim();
      } catch (e: any) {
        output = ((e.stdout || '') + (e.stderr || e.message || '')).trim();
        exitCode = e.exitCode ?? -1;
      }

      const duration = Date.now() - start;
      const status = exitCode === 0 ? 'SUCCESS' : 'FAILED';

      await this.prisma.cronJob.update({
        where: { id },
        data: { lastRunAt: new Date(), lastRunOutput: output, lastRunStatus: status },
      });

      await this.events.create({
        type: 'CRON_RUN',
        title: `Cron job run: ${job.title}`,
        description: `Status: ${status}, Duration: ${duration}ms`,
        severity: status === 'SUCCESS' ? 'SUCCESS' : 'ERROR',
      });

      return { jobId: id, output, exitCode, duration };
    }
  }

  async executeJob(jobId: string): Promise<void> {
    const job = await this.prisma.cronJob.findUnique({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`Cron job ${jobId} not found`);
      return;
    }

    if (!job.enabled) {
      this.logger.log(`Cron job ${jobId} is disabled, skipping`);
      return;
    }

    const start = Date.now();
    let output = '';
    let exitCode = 0;

    try {
      const result = await execFileAsync('bash', ['-c', job.command]);
      output = (result.stdout || '').trim();
    } catch (e: any) {
      output = ((e.stdout || '') + (e.stderr || e.message || '')).trim();
      exitCode = e.exitCode ?? -1;
    }

    const duration = Date.now() - start;
    const status = exitCode === 0 ? 'SUCCESS' : 'FAILED';

    await this.prisma.cronJob.update({
      where: { id: jobId },
      data: { lastRunAt: new Date(), lastRunOutput: output, lastRunStatus: status },
    });

    await this.events.create({
      type: 'CRON_RUN',
      title: `Cron job executed: ${job.title}`,
      description: `Status: ${status}, Duration: ${duration}ms, ExitCode: ${exitCode}`,
      severity: status === 'SUCCESS' ? 'SUCCESS' : 'ERROR',
    });

    this.logger.log(`Cron job ${jobId} (${job.title}) completed with status ${status} in ${duration}ms`);
  }

  // ── Private SSH helpers ──────────────────────────────────────────────────

  private async addRemoteCrontabEntry(
    serverId: string,
    jobId: string,
    title: string,
    cronExpression: string,
    command: string,
  ): Promise<void> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `ssh_cron_key_${Date.now()}`);

    try {
      if (server.sshKeyId) {
        const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
        if (sshKey) {
          fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
        }
      }

      const addCmd = `(crontab -l 2>/dev/null; echo "# hamyar:${jobId} ${title}"; echo "${cronExpression} ${command} # hamyar-id:${jobId}") | crontab -`;

      const sshCmd = server.sshKeyId
        ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} "${addCmd.replace(/"/g, '\\"')}"`
        : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${server.username}@${server.host} -p ${server.port} "${addCmd.replace(/"/g, '\\"')}"`;

      await execFileAsync('bash', ['-c', sshCmd]);
    } finally {
      try {
        if (server.sshKeyId && fs.existsSync(keyFile)) {
          fs.unlinkSync(keyFile);
        }
      } catch {}
    }
  }

  private async removeRemoteCrontabEntry(serverId: string, jobId: string): Promise<void> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) return;

    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `ssh_cron_key_${Date.now()}`);

    try {
      if (server.sshKeyId) {
        const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
        if (sshKey) {
          fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
        }
      }

      const removeCmd = `(crontab -l 2>/dev/null | grep -v "hamyar-id:${jobId}" | grep -v "hamyar:${jobId} ") | crontab -`;

      const sshCmd = server.sshKeyId
        ? `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} "${removeCmd.replace(/"/g, '\\"')}"`
        : `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${server.username}@${server.host} -p ${server.port} "${removeCmd.replace(/"/g, '\\"')}"`;

      await execFileAsync('bash', ['-c', sshCmd]);
    } finally {
      try {
        if (server.sshKeyId && fs.existsSync(keyFile)) {
          fs.unlinkSync(keyFile);
        }
      } catch {}
    }
  }

  private async removeQueueJob(jobId: string): Promise<void> {
    try {
      const repeatableJobs = await this.cronQueue.getRepeatableJobs();
      const job = repeatableJobs.find((j) => j.id === this.jobKey(jobId));
      if (job) {
        await this.cronQueue.removeRepeatableByKey(job.key);
      }
    } catch (e) {
      this.logger.warn(`Failed to remove repeatable job for ${jobId}: ${e}`);
    }
  }
}

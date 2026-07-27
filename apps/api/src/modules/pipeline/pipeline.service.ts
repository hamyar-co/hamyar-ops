import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
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
  PipelineDto,
  PipelineRunDto,
  CreatePipelineDto,
  TriggerPipelineDto,
  StepName,
  PipelineStatus,
} from '@hamyar-ops/shared';

const execFileAsync = promisify(execFile);

function toStepNames(buildMode: string): StepName[] {
  if (buildMode === 'ci') return ['deploy', 'verify'];
  return ['build', 'push', 'deploy', 'verify'];
}

function mapPipelineRun(run: any): PipelineRunDto {
  return {
    id: run.id,
    pipelineId: run.pipelineId,
    pipelineName: run.pipeline?.name ?? undefined,
    status: run.status as PipelineStatus,
    trigger: run.trigger ?? null,
    commitSha: run.commitSha ?? null,
    branch: run.branch ?? null,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    steps: (run.steps ?? []).map((s: any) => ({
      id: s.id,
      runId: s.runId,
      name: s.name as StepName,
      status: s.status as PipelineStatus,
      output: s.output ?? null,
      startedAt: s.startedAt.toISOString(),
      finishedAt: s.finishedAt?.toISOString() ?? null,
    })),
  };
}

function mapPipeline(p: any, hostBase?: string): PipelineDto {
  return {
    id: p.id,
    name: p.name,
    appName: p.appName ?? null,
    serverId: p.serverId ?? null,
    trigger: p.trigger as any,
    webhookToken: p.webhookToken ?? null,
    webhookUrl: p.webhookToken && hostBase
      ? `${hostBase}/api/pipelines/webhook/${p.webhookToken}`
      : null,
    cron: p.cron ?? null,
    strategy: p.strategy as any,
    buildMode: p.buildMode as any,
    registryId: p.registryId ?? null,
    imageTag: p.imageTag ?? null,
    enabled: p.enabled,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    lastRun: p.runs?.[0] ? mapPipelineRun(p.runs[0]) : null,
  };
}

@Injectable()
export class PipelineService implements OnModuleInit {
  private readonly logger = new Logger(PipelineService.name);
  private readonly hostBase =
    process.env.API_HOST_BASE || 'http://localhost:3000';

  constructor(
    private prisma: PrismaService,
    @InjectQueue('pipeline') private pipelineQueue: Queue,
    private eventBus: DeployEventBus,
    @Inject(forwardRef(() => MultiServerService))
    private multiServer: MultiServerService,
  ) {}

  async onModuleInit() {
    const scheduled = await this.prisma.pipeline.findMany({
      where: { trigger: 'schedule', cron: { not: null }, enabled: true },
    });
    for (const p of scheduled) {
      if (!p.cron) continue;
      try {
        await this.pipelineQueue.add(
          'run',
          { pipelineId: p.id },
          { repeat: { pattern: p.cron }, removeOnComplete: 5 },
        );
        this.logger.log(`Scheduled pipeline "${p.name}" with cron ${p.cron}`);
      } catch (e) {
        this.logger.warn(`Failed to schedule pipeline "${p.name}": ${e}`);
      }
    }
  }

  async listPipelines(): Promise<PipelineDto[]> {
    const pipelines = await this.prisma.pipeline.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: { steps: { orderBy: { startedAt: 'asc' } } },
        },
      },
    });
    return pipelines.map((p) => mapPipeline(p, this.hostBase));
  }

  async getPipeline(id: string): Promise<PipelineDto> {
    const p = await this.prisma.pipeline.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 5,
          include: { steps: { orderBy: { startedAt: 'asc' } } },
        },
      },
    });
    if (!p) throw new NotFoundException('Pipeline not found');
    return mapPipeline(p, this.hostBase);
  }

  async createPipeline(dto: CreatePipelineDto): Promise<PipelineDto> {
    const webhookToken =
      dto.trigger === 'webhook'
        ? crypto.randomBytes(32).toString('hex')
        : null;

    const p = await this.prisma.pipeline.create({
      data: {
        name: dto.name,
        appName: dto.appName ?? null,
        serverId: dto.serverId ?? null,
        trigger: dto.trigger ?? 'manual',
        webhookToken,
        cron: dto.cron ?? null,
        strategy: dto.strategy ?? 'rolling',
        buildMode: dto.buildMode ?? 'ci',
        registryId: dto.registryId ?? null,
        imageTag: dto.imageTag ?? null,
        enabled: dto.enabled ?? true,
      },
    });

    if (p.trigger === 'schedule' && p.cron && p.enabled) {
      await this.pipelineQueue.add(
        'run',
        { pipelineId: p.id },
        { repeat: { pattern: p.cron }, removeOnComplete: 5 },
      );
    }

    return mapPipeline(p, this.hostBase);
  }

  async updatePipeline(
    id: string,
    dto: Partial<CreatePipelineDto>,
  ): Promise<PipelineDto> {
    const existing = await this.prisma.pipeline.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pipeline not found');

    // If switching to webhook trigger or regenerating token
    const webhookToken =
      dto.trigger === 'webhook' && !existing.webhookToken
        ? crypto.randomBytes(32).toString('hex')
        : undefined;

    const p = await this.prisma.pipeline.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.appName !== undefined ? { appName: dto.appName } : {}),
        ...(dto.serverId !== undefined ? { serverId: dto.serverId } : {}),
        ...(dto.trigger !== undefined ? { trigger: dto.trigger } : {}),
        ...(webhookToken !== undefined ? { webhookToken } : {}),
        ...(dto.cron !== undefined ? { cron: dto.cron } : {}),
        ...(dto.strategy !== undefined ? { strategy: dto.strategy } : {}),
        ...(dto.buildMode !== undefined ? { buildMode: dto.buildMode } : {}),
        ...(dto.registryId !== undefined ? { registryId: dto.registryId } : {}),
        ...(dto.imageTag !== undefined ? { imageTag: dto.imageTag } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });

    return mapPipeline(p, this.hostBase);
  }

  async deletePipeline(id: string): Promise<void> {
    const p = await this.prisma.pipeline.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pipeline not found');

    if (p.trigger === 'schedule' && p.cron) {
      const jobs = await this.pipelineQueue.getRepeatableJobs();
      for (const job of jobs) {
        if (job.name === 'run') {
          await this.pipelineQueue.removeRepeatableByKey(job.key);
        }
      }
    }

    await this.prisma.pipeline.delete({ where: { id } });
  }

  async enablePipeline(id: string, enabled: boolean): Promise<PipelineDto> {
    const p = await this.prisma.pipeline.update({
      where: { id },
      data: { enabled },
    });

    if (p.trigger === 'schedule' && p.cron) {
      if (enabled) {
        await this.pipelineQueue.add(
          'run',
          { pipelineId: id },
          { repeat: { pattern: p.cron }, removeOnComplete: 5 },
        );
      } else {
        const jobs = await this.pipelineQueue.getRepeatableJobs();
        for (const job of jobs) {
          if (job.name === 'run') {
            await this.pipelineQueue.removeRepeatableByKey(job.key);
          }
        }
      }
    }

    return mapPipeline(p, this.hostBase);
  }

  async handleWebhook(
    token: string,
    payload: { ref?: string; sha?: string; branch?: string },
  ): Promise<PipelineRunDto> {
    const p = await this.prisma.pipeline.findFirst({
      where: { webhookToken: token },
    });
    if (!p) throw new NotFoundException('Pipeline not found');
    if (!p.enabled) throw new BadRequestException('Pipeline is disabled');

    const branch =
      payload.branch ??
      (payload.ref ? payload.ref.replace('refs/heads/', '') : undefined);

    return this.triggerRun(p.id, 'webhook', {
      commitSha: payload.sha,
      branch,
    });
  }

  async triggerRun(
    pipelineId: string,
    trigger: string,
    opts?: TriggerPipelineDto,
  ): Promise<PipelineRunDto> {
    const p = await this.prisma.pipeline.findUnique({
      where: { id: pipelineId },
    });
    if (!p) throw new NotFoundException('Pipeline not found');

    const stepNames = toStepNames(p.buildMode);

    const run = await this.prisma.pipelineRun.create({
      data: {
        pipelineId,
        status: 'PENDING',
        trigger,
        commitSha: opts?.commitSha ?? null,
        branch: opts?.branch ?? null,
        steps: {
          create: stepNames.map((name) => ({
            name,
            status: 'PENDING',
          })),
        },
      },
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
      },
    });

    await this.pipelineQueue.add('run', { runId: run.id });

    return mapPipelineRun(run);
  }

  async getRuns(pipelineId: string, limit = 20): Promise<PipelineRunDto[]> {
    const runs = await this.prisma.pipelineRun.findMany({
      where: { pipelineId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
        pipeline: { select: { name: true } },
      },
    });
    return runs.map(mapPipelineRun);
  }

  async getRun(runId: string): Promise<PipelineRunDto> {
    const run = await this.prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
        pipeline: { select: { name: true } },
      },
    });
    if (!run) throw new NotFoundException('Run not found');
    return mapPipelineRun(run);
  }

  async rollbackRun(runId: string): Promise<PipelineRunDto> {
    const failedRun = await this.prisma.pipelineRun.findUnique({
      where: { id: runId },
    });
    if (!failedRun) throw new NotFoundException('Run not found');

    // Find the most recent successful run
    const prevSuccessful = await this.prisma.pipelineRun.findFirst({
      where: { pipelineId: failedRun.pipelineId, status: 'SUCCESS' },
      orderBy: { startedAt: 'desc' },
    });

    const rollbackRun = await this.prisma.pipelineRun.create({
      data: {
        pipelineId: failedRun.pipelineId,
        status: 'PENDING',
        trigger: 'rollback',
        commitSha: prevSuccessful?.commitSha ?? null,
        branch: prevSuccessful?.branch ?? null,
        steps: {
          create: [{ name: 'rollback', status: 'PENDING' }],
        },
      },
      include: { steps: { orderBy: { startedAt: 'asc' } } },
    });

    await this.pipelineQueue.add('run', { runId: rollbackRun.id });
    return mapPipelineRun(rollbackRun);
  }

  // ─── Execution logic (called by processor) ──────────────────────────────────

  async executeRun(runId: string): Promise<void> {
    const run = await this.prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
        pipeline: true,
      },
    });
    if (!run) {
      this.logger.warn(`executeRun: run ${runId} not found`);
      return;
    }

    const pipeline = run.pipeline;

    // Mark run as RUNNING
    await this.prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: 'RUNNING' },
    });

    for (const step of run.steps) {
      // Mark step RUNNING
      await this.prisma.pipelineStep.update({
        where: { id: step.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      this.eventBus.emit(WsEvents.PIPELINE_STEP, {
        runId,
        pipelineId: pipeline.id,
        stepId: step.id,
        stepName: step.name,
        status: 'RUNNING',
      });

      let output = '';
      let success = true;

      try {
        output = await this.executeStep(
          step.name as StepName,
          pipeline,
          run,
          runId,
          step.id,
        );
      } catch (err: any) {
        success = false;
        output = err?.message ?? String(err);
        this.logger.error(`Step ${step.name} failed for run ${runId}: ${output}`);
      }

      const stepStatus: PipelineStatus = success ? 'SUCCESS' : 'FAILED';
      await this.prisma.pipelineStep.update({
        where: { id: step.id },
        data: { status: stepStatus, output, finishedAt: new Date() },
      });
      this.eventBus.emit(WsEvents.PIPELINE_STEP, {
        runId,
        pipelineId: pipeline.id,
        stepId: step.id,
        stepName: step.name,
        status: stepStatus,
      });

      if (!success) {
        // Mark remaining steps FAILED
        const remainingIds = run.steps
          .filter((s) => s.id !== step.id && s.status === 'PENDING')
          .map((s) => s.id);
        if (remainingIds.length > 0) {
          await this.prisma.pipelineStep.updateMany({
            where: { id: { in: remainingIds } },
            data: { status: 'FAILED', finishedAt: new Date() },
          });
        }

        await this.prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: 'FAILED', finishedAt: new Date() },
        });
        this.eventBus.emit(WsEvents.PIPELINE_DONE, {
          runId,
          pipelineId: pipeline.id,
          status: 'FAILED',
        });
        return;
      }
    }

    await this.prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: 'SUCCESS', finishedAt: new Date() },
    });
    this.eventBus.emit(WsEvents.PIPELINE_DONE, {
      runId,
      pipelineId: pipeline.id,
      status: 'SUCCESS',
    });
  }

  private emitLog(runId: string, pipelineId: string, stepId: string, stepName: string, line: string) {
    this.eventBus.emit(WsEvents.PIPELINE_LOG, {
      runId,
      pipelineId,
      stepId,
      stepName,
      line,
    });
  }

  private async executeStep(
    stepName: StepName,
    pipeline: any,
    run: any,
    runId: string,
    stepId: string,
  ): Promise<string> {
    const emit = (line: string) =>
      this.emitLog(runId, pipeline.id, stepId, stepName, line);

    const imageTag = pipeline.imageTag ?? pipeline.appName ?? 'app:latest';
    const appName = pipeline.appName ?? 'app';
    const serverId = pipeline.serverId;

    switch (stepName) {
      case 'build': {
        emit(`Building image ${imageTag}...`);
        if (pipeline.buildMode === 'remote' && serverId) {
          const result = await this.multiServer.executeRemoteCommand(
            serverId,
            `docker build -t ${imageTag} ${pipeline.contextPath || '.'}`,
          );
          emit(result.output || '');
          if (!result.success) throw new Error(result.error ?? 'Remote build failed');
          return result.output;
        } else {
          // local build
          const { stdout, stderr } = await execFileAsync('docker', [
            'build',
            '-t',
            imageTag,
            pipeline.contextPath || '.',
          ]);
          const out = [stdout, stderr].filter(Boolean).join('\n');
          out.split('\n').forEach(emit);
          return out;
        }
      }

      case 'push': {
        emit(`Pushing image ${imageTag}...`);
        if (serverId) {
          const result = await this.multiServer.executeRemoteCommand(
            serverId,
            `docker push ${imageTag}`,
          );
          emit(result.output || '');
          if (!result.success) throw new Error(result.error ?? 'Push failed');
          return result.output;
        } else {
          const { stdout, stderr } = await execFileAsync('docker', [
            'push',
            imageTag,
          ]);
          const out = [stdout, stderr].filter(Boolean).join('\n');
          out.split('\n').forEach(emit);
          return out;
        }
      }

      case 'deploy': {
        emit(`Deploying ${appName} using strategy: ${pipeline.strategy}`);
        if (!serverId) throw new Error('No server configured for deploy step');

        if (pipeline.strategy === 'restart') {
          const r = await this.multiServer.executeRemoteCommand(
            serverId,
            `pm2 reload ${appName} --update-env`,
          );
          emit(r.output || '');
          if (!r.success) throw new Error(r.error ?? 'pm2 reload failed');
          return r.output;
        }

        if (pipeline.strategy === 'rolling') {
          const r = await this.multiServer.executeRemoteCommand(
            serverId,
            `docker compose pull && docker compose up -d --no-deps ${appName}`,
          );
          emit(r.output || '');
          if (!r.success) throw new Error(r.error ?? 'Rolling deploy failed');
          return r.output;
        }

        if (pipeline.strategy === 'blue-green') {
          emit('Starting blue-green deployment...');
          // Start new container on port+1 (simplified)
          const r1 = await this.multiServer.executeRemoteCommand(
            serverId,
            `docker compose pull && docker compose up -d --no-deps --scale ${appName}=2 ${appName}`,
          );
          emit(r1.output || '');
          if (!r1.success) throw new Error(r1.error ?? 'Blue-green start failed');

          // Switch traffic (simplified - reload nginx if available)
          emit('Switching traffic to new instance...');
          const r2 = await this.multiServer.executeRemoteCommand(
            serverId,
            `nginx -s reload 2>/dev/null || true`,
          );
          emit(r2.output || '');

          // Scale down old instance
          const r3 = await this.multiServer.executeRemoteCommand(
            serverId,
            `docker compose up -d --no-deps --scale ${appName}=1 ${appName}`,
          );
          emit(r3.output || '');
          if (!r3.success) throw new Error(r3.error ?? 'Blue-green scale-down failed');
          return [r1.output, r2.output, r3.output].join('\n');
        }

        throw new Error(`Unknown strategy: ${pipeline.strategy}`);
      }

      case 'verify': {
        emit(`Verifying ${appName}...`);
        if (pipeline.healthUrl) {
          // HTTP health check
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);
          try {
            const res = await fetch(pipeline.healthUrl, {
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (res.status < 200 || res.status >= 400) {
              throw new Error(`Health check returned ${res.status}`);
            }
            emit(`Health check passed: ${res.status}`);
            return `Health check OK: ${res.status}`;
          } catch (err: any) {
            clearTimeout(timeout);
            throw new Error(`Health check failed: ${err.message}`);
          }
        } else if (serverId) {
          const r = await this.multiServer.executeRemoteCommand(
            serverId,
            `pm2 show ${appName} | grep -E "status|online" || docker compose ps ${appName}`,
          );
          emit(r.output || '');
          if (!r.success) throw new Error(r.error ?? 'Verify failed');
          return r.output;
        } else {
          emit('No health URL or server configured; skipping verify');
          return 'Skipped';
        }
      }

      case 'rollback': {
        emit(`Rolling back ${appName}...`);
        if (!serverId) throw new Error('No server configured for rollback');
        const r = await this.multiServer.executeRemoteCommand(
          serverId,
          `pm2 reload ${appName} 2>/dev/null || docker compose up -d --no-deps ${appName}`,
        );
        emit(r.output || '');
        if (!r.success) throw new Error(r.error ?? 'Rollback failed');
        return r.output;
      }

      default:
        throw new Error(`Unknown step: ${stepName}`);
    }
  }
}

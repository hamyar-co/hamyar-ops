import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { S3StorageService } from '../backups/s3-storage.service';
import {
  WsEvents,
  type CreateTerraformWorkspaceDto,
  type TerraformWorkspaceDto,
  type TerraformRunDto,
  type TerraformPlanSummary,
  type TerraformModuleTemplate,
} from '@hamyar-ops/shared';

const execAsync = promisify(execFile);

@Injectable()
export class TerraformService {
  private readonly logger = new Logger(TerraformService.name);
  private readonly TF_BASE_DIR = process.env.TF_BASE_DIR || '/opt/hamyar/tf';

  constructor(
    private prisma: PrismaService,
    @InjectQueue('terraform') private tfQueue: Queue,
    private eventBus: DeployEventBus,
    @Inject(forwardRef(() => S3StorageService)) private s3: S3StorageService,
  ) {}

  // ─── Workspaces ────────────────────────────────────────────────────────────

  async listWorkspaces(): Promise<TerraformWorkspaceDto[]> {
    const workspaces = await this.prisma.terraformWorkspace.findMany({
      include: {
        runs: {
          take: 1,
          orderBy: { startedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return workspaces.map((w) => this.toWorkspaceDto(w));
  }

  async getWorkspace(id: string): Promise<TerraformWorkspaceDto> {
    const workspace = await this.prisma.terraformWorkspace.findUnique({
      where: { id },
      include: {
        runs: {
          take: 1,
          orderBy: { startedAt: 'desc' },
        },
      },
    });
    if (!workspace) throw new NotFoundException(`Terraform workspace ${id} not found`);
    return this.toWorkspaceDto(workspace);
  }

  async createWorkspace(dto: CreateTerraformWorkspaceDto): Promise<TerraformWorkspaceDto> {
    const workingDir = path.join(this.TF_BASE_DIR, dto.name);

    const workspace = await this.prisma.terraformWorkspace.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        workingDir,
        stateBackend: dto.stateBackend ?? 'local',
        s3ConfigId: dto.s3ConfigId ?? null,
        s3Key: dto.s3Key ?? null,
        variables: dto.variables ?? undefined,
      },
      include: { runs: { take: 1, orderBy: { startedAt: 'desc' } } },
    });

    fs.mkdirSync(workingDir, { recursive: true });
    this.logger.log(`created workspace dir: ${workingDir}`);

    if (dto.templateKey) {
      const content = this.getTemplateContent(dto.templateKey, dto.templateVars ?? {});
      fs.writeFileSync(path.join(workingDir, 'main.tf'), content, 'utf8');
      this.logger.log(`wrote ${dto.templateKey} template to ${workingDir}/main.tf`);
    }

    return this.toWorkspaceDto(workspace);
  }

  async deleteWorkspace(id: string): Promise<void> {
    const workspace = await this.prisma.terraformWorkspace.findUnique({ where: { id } });
    if (!workspace) throw new NotFoundException(`Terraform workspace ${id} not found`);

    await this.prisma.terraformWorkspace.delete({ where: { id } });

    if (fs.existsSync(workspace.workingDir)) {
      await execAsync('rm', ['-rf', workspace.workingDir]).catch((e) =>
        this.logger.warn(`could not remove ${workspace.workingDir}: ${e?.message}`),
      );
    }
  }

  // ─── Runs ──────────────────────────────────────────────────────────────────

  async runCommand(
    workspaceId: string,
    command: 'init' | 'plan' | 'apply' | 'destroy',
  ): Promise<TerraformRunDto> {
    const workspace = await this.prisma.terraformWorkspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException(`Terraform workspace ${workspaceId} not found`);

    const run = await this.prisma.terraformRun.create({
      data: {
        workspaceId,
        command,
        status: 'PENDING',
      },
    });

    await this.tfQueue.add('run', { runId: run.id, workspaceId, command });
    this.logger.log(`queued terraform ${command} run ${run.id} for workspace ${workspaceId}`);

    return this.toRunDto(run);
  }

  async getRuns(workspaceId: string): Promise<TerraformRunDto[]> {
    const runs = await this.prisma.terraformRun.findMany({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return runs.map((r) => this.toRunDto(r));
  }

  // ─── Execution (called by processor) ──────────────────────────────────────

  async executeRun(runId: string): Promise<void> {
    const run = await this.prisma.terraformRun.findUnique({
      where: { id: runId },
      include: { workspace: true },
    });
    if (!run) {
      this.logger.error(`run ${runId} not found`);
      return;
    }

    const { workspace } = run;
    const workingDir = workspace.workingDir;
    const command = run.command as 'init' | 'plan' | 'apply' | 'destroy';

    await this.prisma.terraformRun.update({
      where: { id: runId },
      data: { status: 'RUNNING' },
    });

    this.eventBus.emit(WsEvents.TF_LOG, {
      runId,
      workspaceId: workspace.id,
      line: `▶ terraform ${command} starting…`,
      stream: 'stdout',
    });

    const outputLines: string[] = [];

    try {
      // write backend.tf if s3 config is set
      if (workspace.stateBackend === 's3' && workspace.s3ConfigId) {
        await this.writeBackendTf(workspace, workingDir);
      }

      // write .tfvars if variables are set
      const variables = workspace.variables as Record<string, string> | null;
      if (variables && Object.keys(variables).length > 0) {
        const tfvarsContent = Object.entries(variables)
          .map(([k, v]) => `${k} = "${String(v).replace(/"/g, '\\"')}"`)
          .join('\n');
        fs.writeFileSync(path.join(workingDir, 'terraform.tfvars'), tfvarsContent, 'utf8');
      }

      const args: string[] = [
        `-chdir=${workingDir}`,
        command,
        '-no-color',
      ];
      if (command === 'apply' || command === 'destroy') {
        args.push('-auto-approve');
      }

      await new Promise<void>((resolve, reject) => {
        const child = spawn('terraform', args, { env: { ...process.env } });

        const handleLine = (data: Buffer, stream: 'stdout' | 'stderr') => {
          const text = data.toString();
          const lines = text.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            outputLines.push(line);
            this.eventBus.emit(WsEvents.TF_LOG, {
              runId,
              workspaceId: workspace.id,
              line,
              stream,
            });
          }
        };

        child.stdout.on('data', (d) => handleLine(d, 'stdout'));
        child.stderr.on('data', (d) => handleLine(d, 'stderr'));

        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`terraform ${command} exited with code ${code}`));
        });
      });

      const output = outputLines.join('\n');
      const planSummary = this.parsePlanSummary(output);

      await this.prisma.terraformRun.update({
        where: { id: runId },
        data: {
          status: 'SUCCESS',
          output,
          planSummary: planSummary ? JSON.parse(JSON.stringify(planSummary)) : undefined,
          finishedAt: new Date(),
        },
      });

      this.eventBus.emit(WsEvents.TF_DONE, {
        runId,
        workspaceId: workspace.id,
        status: 'SUCCESS',
        planSummary: planSummary ?? null,
      });
      this.logger.log(`terraform run ${runId} completed successfully`);
    } catch (err: any) {
      const output = outputLines.join('\n');
      const msg = err?.message ?? String(err);
      this.logger.error(`terraform run ${runId} failed: ${msg}`);

      await this.prisma.terraformRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          output: output + `\n✗ ${msg}`,
          finishedAt: new Date(),
        },
      });

      this.eventBus.emit(WsEvents.TF_DONE, {
        runId,
        workspaceId: workspace.id,
        status: 'FAILED',
        planSummary: null,
      });
    }
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  getTemplates(): TerraformModuleTemplate[] {
    return [
      {
        key: 'server-bootstrap',
        name: 'Server Bootstrap',
        description: 'Manages DNS record and firewall for a new server. Pair with the Ansible bootstrap playbook to install Node.js, PM2, Docker, Nginx, and UFW.',
        variables: [
          { name: 'server_name', description: 'Hostname for the new server', required: true },
          { name: 'server_ip', description: 'Public IP address of the server', required: true },
          { name: 'domain', description: 'Optional domain to point at the server', required: false, default: '' },
        ],
      },
      {
        key: 'web-app-stack',
        name: 'Web App Stack',
        description: 'Documents the expected state of a web app server running Nginx + PM2 (Node.js) + PostgreSQL + Redis.',
        variables: [
          { name: 'app_name', description: 'Name of the application', required: true },
          { name: 'domain', description: 'Public domain for the app', required: true },
          { name: 'server_ip', description: 'IP address of the server', required: true },
        ],
      },
      {
        key: 'docker-stack',
        name: 'Docker Stack',
        description: 'Documents Docker + Compose stack configuration with optional Watchtower auto-pull. Use with the Registry module to build and push images.',
        variables: [
          { name: 'app_name', description: 'Name of the Docker application', required: true },
          { name: 'registry_url', description: 'Container registry URL', required: true },
          { name: 'server_ip', description: 'IP address of the Docker host', required: true },
        ],
      },
      {
        key: 'monitoring-stack',
        name: 'Monitoring Stack',
        description: 'Prometheus + Grafana + Loki + node-exporter stack. Use the Observability → Install tab to deploy via Ansible.',
        variables: [
          { name: 'server_ip', description: 'IP of the monitoring server', required: true },
          { name: 'grafana_port', description: 'Grafana port', required: false, default: '3000' },
          { name: 'prometheus_port', description: 'Prometheus port', required: false, default: '9090' },
        ],
      },
    ];
  }

  getTemplateContent(
    key: string,
    vars: Record<string, string> = {},
  ): string {
    const sub = (tpl: string): string =>
      tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);

    switch (key) {
      case 'server-bootstrap':
        return sub(`# Server Bootstrap Template
# Manages DNS record and firewall for a new server
# Variables: server_name, server_ip, domain (optional)

variable "server_name" { default = "{{server_name}}" }
variable "server_ip"   { default = "{{server_ip}}" }
variable "domain"      { default = "{{domain}}" }

output "server_ip"   { value = var.server_ip }
output "server_name" { value = var.server_name }

# After provisioning, run the Ansible bootstrap playbook from hamyar-ops
# to install Node.js, PM2, Docker, Nginx, and UFW on this server.
`);

      case 'web-app-stack':
        return sub(`# Web App Stack Template
# Documents the expected state of a web app server
# Variables: app_name, domain, server_ip

variable "app_name"  { default = "{{app_name}}" }
variable "domain"    { default = "{{domain}}" }
variable "server_ip" { default = "{{server_ip}}" }

output "app_url" { value = "https://\${var.domain}" }
output "server"  { value = var.server_ip }

# Stack: Nginx + PM2 (Node.js app) + PostgreSQL + Redis
# Use Ansible bootstrap playbook to configure this server.
`);

      case 'docker-stack':
        return sub(`# Docker Stack Template
# Documents Docker + Compose stack configuration
# Variables: app_name, registry_url, server_ip

variable "app_name"     { default = "{{app_name}}" }
variable "registry_url" { default = "{{registry_url}}" }
variable "server_ip"    { default = "{{server_ip}}" }

output "registry" { value = var.registry_url }
output "server"   { value = var.server_ip }

# Stack: Docker Engine + Docker Compose + Watchtower (auto-pull)
# Use the hamyar-ops Registry module to build and push images.
`);

      case 'monitoring-stack':
        return sub(`# Monitoring Stack Template
# Prometheus + Grafana + Loki + node-exporter
# Variables: server_ip, grafana_port, prometheus_port

variable "server_ip"       { default = "{{server_ip}}" }
variable "grafana_port"    { default = "3000" }
variable "prometheus_port" { default = "9090" }
variable "loki_port"       { default = "3100" }

output "grafana_url"    { value = "http://\${var.server_ip}:\${var.grafana_port}" }
output "prometheus_url" { value = "http://\${var.server_ip}:\${var.prometheus_port}" }
output "loki_url"       { value = "http://\${var.server_ip}:\${var.loki_port}" }

# Use the hamyar-ops Observability → Install tab to deploy this stack via Ansible.
`);

      default:
        return `# Unknown template key: ${key}\n`;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  parsePlanSummary(output: string): TerraformPlanSummary | null {
    const match = output.match(/Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/);
    if (!match) return null;
    return {
      add: parseInt(match[1], 10),
      change: parseInt(match[2], 10),
      destroy: parseInt(match[3], 10),
    };
  }

  private async writeBackendTf(workspace: any, workingDir: string): Promise<void> {
    if (!workspace.s3ConfigId) return;
    const cfg = await this.prisma.s3Config.findUnique({ where: { id: workspace.s3ConfigId } });
    if (!cfg) {
      this.logger.warn(`s3Config ${workspace.s3ConfigId} not found, skipping backend.tf`);
      return;
    }
    const s3Key = workspace.s3Key ?? `terraform/${workspace.name}/terraform.tfstate`;
    const backendTf = `terraform {
  backend "s3" {
    endpoint = "${cfg.endpoint}"
    bucket   = "${cfg.bucket}"
    key      = "${s3Key}"
    region   = "${cfg.region || 'default'}"
    access_key = "${cfg.accessKeyId}"
    secret_key = "${cfg.secretAccessKey}"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}
`;
    fs.writeFileSync(path.join(workingDir, 'backend.tf'), backendTf, 'utf8');
    this.logger.log(`wrote backend.tf for workspace ${workspace.name}`);
  }

  private toWorkspaceDto(w: any): TerraformWorkspaceDto {
    return {
      id: w.id,
      name: w.name,
      description: w.description ?? null,
      workingDir: w.workingDir,
      stateBackend: w.stateBackend as 'local' | 's3',
      s3ConfigId: w.s3ConfigId ?? null,
      s3Key: w.s3Key ?? null,
      variables: (w.variables as Record<string, string> | null) ?? null,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      lastRun: w.runs?.[0] ? this.toRunDto(w.runs[0]) : null,
    };
  }

  private toRunDto(r: any): TerraformRunDto {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      command: r.command as TerraformRunDto['command'],
      status: r.status as TerraformRunDto['status'],
      output: r.output ?? null,
      planSummary: (r.planSummary as TerraformPlanSummary | null) ?? null,
      triggeredBy: r.triggeredBy ?? null,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }
}

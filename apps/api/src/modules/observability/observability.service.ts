import { Injectable, NotFoundException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AnsibleService } from '../ansible/ansible.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface PublicStatusDto {
  overall: 'up' | 'degraded' | 'down';
  apps: Array<{
    name: string;
    status: string;
    url?: string | null;
    activeIncident?: string | null;
  }>;
  snapshot: {
    totalApps: number;
    upCount: number;
    downCount: number;
    degradedCount: number;
  } | null;
  updatedAt: string;
}

export interface PrometheusTarget {
  targets: string[];
  labels: {
    job: string;
    name: string;
  };
}

export interface InstallStatusDto {
  prometheus: boolean;
  grafana: boolean;
  loki: boolean;
}

@Injectable()
export class ObservabilityService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AnsibleService))
    private ansible: AnsibleService,
  ) {}

  async getPublicStatus(): Promise<PublicStatusDto> {
    const [appConfigs, snapshot] = await Promise.all([
      this.prisma.appConfig.findMany({
        include: {
          incidents: {
            where: { resolvedAt: null },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.monitoringSnapshot.findFirst({ orderBy: { timestamp: 'desc' } }),
    ]);

    const apps = appConfigs.map((app) => {
      const activeIncident = app.incidents[0] ?? null;
      let status = 'unknown';
      if (activeIncident) {
        status = activeIncident.status.toLowerCase();
      } else {
        status = 'up';
      }
      return {
        name: app.name,
        status,
        url: app.healthUrl ?? app.domain ?? null,
        activeIncident: activeIncident?.title ?? null,
      };
    });

    const downApps = apps.filter((a) => a.status === 'down').length;
    const degradedApps = apps.filter((a) => a.status === 'degraded').length;
    let overall: 'up' | 'degraded' | 'down' = 'up';
    if (downApps > 0) overall = 'down';
    else if (degradedApps > 0) overall = 'degraded';

    return {
      overall,
      apps,
      snapshot: snapshot
        ? {
            totalApps: snapshot.totalApps,
            upCount: snapshot.upCount,
            downCount: snapshot.downCount,
            degradedCount: snapshot.degradedCount,
          }
        : null,
      updatedAt: snapshot?.timestamp.toISOString() ?? new Date().toISOString(),
    };
  }

  async getGrafanaUrl(serverId: string): Promise<{ url: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    return { url: `http://${server.host}:3000` };
  }

  async getPrometheusTargets(): Promise<PrometheusTarget[]> {
    const servers = await this.prisma.managedServer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return servers.map((s) => ({
      targets: [`${s.host}:9100`],
      labels: { job: 'node', name: s.name },
    }));
  }

  async getInstallStatus(serverId: string): Promise<InstallStatusDto> {
    const server = await this.prisma.managedServer.findUnique({
      where: { id: serverId },
      include: { sshKey: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const tempDir = os.tmpdir();
    const keyFile = path.join(tempDir, `obs_key_${Date.now()}`);

    try {
      if (server.sshKey) {
        fs.writeFileSync(keyFile, server.sshKey.privateKey, { mode: 0o600 });
      }

      const sshArgs = [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=10',
        ...(server.sshKey ? ['-i', keyFile] : []),
        '-p', String(server.port),
        `${server.username}@${server.host}`,
        'which prometheus 2>/dev/null && echo PROM_OK; which grafana-server 2>/dev/null && echo GRAF_OK; which promtail 2>/dev/null && echo LOKI_OK; exit 0',
      ];

      const { stdout } = await execFileAsync('ssh', sshArgs).catch(() => ({ stdout: '' }));

      return {
        prometheus: stdout.includes('PROM_OK'),
        grafana: stdout.includes('GRAF_OK'),
        loki: stdout.includes('LOKI_OK'),
      };
    } finally {
      try { if (server.sshKey) fs.unlinkSync(keyFile); } catch {}
    }
  }

  async installStack(serverId: string): Promise<{ jobId: string }> {
    const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    // Find or create the monitoring-stack built-in playbook
    let playbook = await this.prisma.ansiblePlaybook.findUnique({
      where: { name: 'monitoring-stack' },
    });

    if (!playbook) {
      playbook = await this.prisma.ansiblePlaybook.create({
        data: {
          name: 'monitoring-stack',
          description: 'Install Prometheus, Grafana, and Loki (Promtail) on a server',
          builtIn: true,
          targetTags: [],
          content: `---
- name: Install monitoring stack
  hosts: all
  become: yes
  tasks:
    - name: Install Prometheus
      apt:
        name: prometheus
        state: present
        update_cache: yes
    - name: Install Grafana
      block:
        - name: Add Grafana GPG key
          apt_key:
            url: https://packages.grafana.com/gpg.key
            state: present
        - name: Add Grafana repo
          apt_repository:
            repo: "deb https://packages.grafana.com/oss/deb stable main"
            state: present
        - name: Install grafana
          apt:
            name: grafana
            state: present
            update_cache: yes
        - name: Enable and start grafana
          systemd:
            name: grafana-server
            enabled: yes
            state: started
    - name: Install Loki (Promtail)
      block:
        - name: Download promtail binary
          get_url:
            url: "https://github.com/grafana/loki/releases/latest/download/promtail-linux-amd64.zip"
            dest: /tmp/promtail.zip
        - name: Unzip promtail
          unarchive:
            src: /tmp/promtail.zip
            dest: /usr/local/bin/
            remote_src: yes
        - name: Rename binary
          command: mv /usr/local/bin/promtail-linux-amd64 /usr/local/bin/promtail
          args:
            creates: /usr/local/bin/promtail
`,
        },
      });
    }

    const job = await this.ansible.runPlaybook(playbook.id, { serverIds: [serverId] });
    return { jobId: job.id };
  }
}

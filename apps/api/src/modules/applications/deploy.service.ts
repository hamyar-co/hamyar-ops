import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { WsEvents } from '@hamyar-ops/shared';
import { spawn } from 'child_process';

@Injectable()
export class DeployService {
  constructor(
    private prisma: PrismaService,
    private deployEventBus: DeployEventBus,
  ) {}

  async runDeploy(versionId: string, appName: string, cmd: string, deployedBy: string, serverId: string | null = null): Promise<string> {
    await this.prisma.appVersion.update({
      where: { id: versionId },
      data: { status: 'IN_PROGRESS' },
    });

    this.deployEventBus.emit(WsEvents.DEPLOY_START, { appName, versionId });

    const logs: string[] = [];
    
    return new Promise<string>(async (resolve) => {
      let childProcess;
      let keyFile: string | null = null;
      
      try {
        if (serverId) {
          const server = await this.prisma.managedServer.findUnique({ where: { id: serverId } });
          if (!server) throw new Error('Target server not found');
          
          let sshCmd = '';
          if (server.sshKeyId) {
            const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
            if (sshKey) {
              const os = require('os');
              const path = require('path');
              const fs = require('fs');
              keyFile = path.join(os.tmpdir(), `ssh_key_${Date.now()}_deploy`);
              fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });
              sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i "${keyFile}" ${server.username}@${server.host} -p ${server.port} "${cmd.replace(/"/g, '\\"')}"`;
            } else {
              sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${server.username}@${server.host} -p ${server.port} "${cmd.replace(/"/g, '\\"')}"`;
            }
          } else {
            sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${server.username}@${server.host} -p ${server.port} "${cmd.replace(/"/g, '\\"')}"`;
          }
          
          childProcess = spawn('bash', ['-c', sshCmd], { env: { ...process.env }, cwd: '/' });
        } else {
          childProcess = spawn('sh', ['-c', cmd], { env: { ...process.env }, cwd: '/' });
        }
      } catch (err: any) {
        await this.prisma.appVersion.update({
          where: { id: versionId },
          data: { status: 'FAILED', finishedAt: new Date(), logs: err.message },
        });
        this.deployEventBus.emit(WsEvents.DEPLOY_DONE, { appName, versionId, status: 'FAILED', exitCode: null });
        return resolve('FAILED');
      }

      const handleData = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
        const line = chunk.toString();
        logs.push(line);
        this.deployEventBus.emit(WsEvents.DEPLOY_LOG, { appName, versionId, line, stream });
      };

      childProcess.stdout.on('data', handleData('stdout'));
      childProcess.stderr.on('data', handleData('stderr'));

      childProcess.on('close', async (exitCode) => {
        if (keyFile) {
          const fs = require('fs');
          try { fs.unlinkSync(keyFile); } catch {}
        }
        const status = exitCode === 0 ? 'SUCCESS' : 'FAILED';
        await this.prisma.appVersion.update({
          where: { id: versionId },
          data: { status, finishedAt: new Date(), logs: logs.join('').slice(-50 * 1024) },
        });
        this.deployEventBus.emit(WsEvents.DEPLOY_DONE, { appName, versionId, status, exitCode });
        resolve(status);
      });

      childProcess.on('error', async (err) => {
        if (keyFile) {
          const fs = require('fs');
          try { fs.unlinkSync(keyFile); } catch {}
        }
        await this.prisma.appVersion.update({
          where: { id: versionId },
          data: { status: 'FAILED', finishedAt: new Date(), logs: err.message },
        });
        this.deployEventBus.emit(WsEvents.DEPLOY_DONE, { appName, versionId, status: 'FAILED', exitCode: null });
        resolve('FAILED');
      });
    });
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { SshService } from '../../infrastructure/ssh/ssh.service';
import { EventsService } from '../events/events.service';
import { WsEvents } from '@hamyar-ops/shared';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import { getJwtAccessSecret, getCorsOrigins } from '../../common/security/secrets';
import { isSafeAbsolutePath, isSafeDockerId } from '../../common/security/path-guard';

interface TerminalSession {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
}

interface CreatePayload {
  cols: number;
  rows: number;
  target?: {
    kind: 'pm2' | 'docker' | 'shell';
    deployPath?: string | null;
    containerId?: string | null;
    command?: string | null;
  };
}

@WebSocketGateway({
  namespace: '/terminal',
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class TerminalGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private sessions = new Map<string, TerminalSession>();
  private shellChildren = new Map<string, ChildProcessWithoutNullStreams>();
  private sessionOwners = new Map<string, Set<string>>();
  // Buffer per socket for accumulating typed characters until Enter (\r or \n)
  private cmdBuffers = new Map<string, string>();

  constructor(
    private ssh: SshService,
    private jwtService: JwtService,
    private eventsService: EventsService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Unauthorized'));
      try {
        const payload = this.jwtService.verify(token, {
          secret: getJwtAccessSecret(),
        });
        // Only ADMIN may open interactive terminals
        if (payload.role !== 'ADMIN') {
          return next(new Error('Forbidden'));
        }
        (socket as any).user = payload;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  private assertOwnsSession(client: Socket, sessionId: string): void {
    const owned = this.sessionOwners.get(client.id);
    if (!sessionId || !owned?.has(sessionId)) {
      throw new WsException('Forbidden: session not owned by this connection');
    }
  }

  @SubscribeMessage(WsEvents.TERMINAL_CREATE)
  async handleCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: CreatePayload,
  ) {
    const sessionId = crypto.randomUUID();
    const cols = Math.min(Math.max(data?.cols || 80, 20), 500);
    const rows = Math.min(Math.max(data?.rows || 24, 5), 200);
    const target = data?.target;

    if (!this.sessionOwners.has(client.id)) this.sessionOwners.set(client.id, new Set());
    this.sessionOwners.get(client.id)!.add(sessionId);

    // Docker exec PTY: `docker exec -it <container> /bin/sh`
    if (target?.kind === 'docker' && target.containerId) {
      if (!isSafeDockerId(target.containerId)) {
        throw new WsException('Invalid container id');
      }
      // Only allow a short allowlist of shells/commands
      const cmd = target.command || '/bin/sh';
      if (!/^(\/bin\/(sh|bash|zsh)|\/usr\/bin\/(bash|zsh)|sh|bash|zsh)$/.test(cmd)) {
        throw new WsException('Invalid container shell command');
      }

      const child = spawn(
        'docker',
        ['exec', '-it', target.containerId, cmd],
        { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TERM: 'xterm-256color' } },
      );
      this.shellChildren.set(sessionId, child);

      child.stdout.on('data', (d: Buffer) => client.emit(WsEvents.TERMINAL_OUTPUT, { sessionId, data: d.toString() }));
      child.stderr.on('data', (d: Buffer) => client.emit(WsEvents.TERMINAL_OUTPUT, { sessionId, data: d.toString() }));
      child.on('close', () => {
        client.emit(WsEvents.TERMINAL_CLOSED, { sessionId });
        this.sessions.delete(sessionId);
        this.shellChildren.delete(sessionId);
        this.sessionOwners.get(client.id)?.delete(sessionId);
      });

      this.sessions.set(sessionId, {
        write: (data) => child.stdin.write(data),
        resize: () => child.kill('SIGWINCH'),
        close: () => child.kill('SIGTERM'),
      });
      return { sessionId };
    }

    // SSH shell PTY with a starting working directory (for PM2/static apps).
    try {
      const session = await this.ssh.ptySession(
        cols,
        rows,
        (output) => client.emit(WsEvents.TERMINAL_OUTPUT, { sessionId, data: output }),
        () => {
          client.emit(WsEvents.TERMINAL_CLOSED, { sessionId });
          this.sessions.delete(sessionId);
          this.sessionOwners.get(client.id)?.delete(sessionId);
        },
      );
      this.sessions.set(sessionId, session);

      // cd into the deploy path if provided — sanitize to prevent shell injection
      if (target?.deployPath) {
        if (!isSafeAbsolutePath(target.deployPath)) {
          throw new WsException('Invalid deploy path');
        }
        // Quote path safely for the remote shell
        const quoted = `'${target.deployPath.replace(/'/g, `'\\''`)}'`;
        try { session.write(`cd ${quoted} && clear\n`); } catch {}
      }

      return { sessionId };
    } catch (err: any) {
      client.emit(WsEvents.TERMINAL_OUTPUT, {
        sessionId,
        data: `\r\n\x1b[31mSSH Connection Error: ${err.message || 'Authentication failed'}\x1b[0m\r\n\x1b[33mEnsure local SSH keys (~/.ssh/id_rsa) or credentials are valid in server settings.\x1b[0m\r\n`,
      });
      client.emit(WsEvents.TERMINAL_CLOSED, { sessionId });
      return { sessionId, error: err.message };
    }
  }

  @SubscribeMessage(WsEvents.TERMINAL_INPUT)
  handleInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; data: string },
  ) {
    this.assertOwnsSession(client, data?.sessionId);
    this.sessions.get(data.sessionId)?.write(data.data);

    // Accumulate characters and log command on Enter
    const chunk = data.data ?? '';
    const hasEnter = chunk.includes('\r') || chunk.includes('\n');
    const current = this.cmdBuffers.get(client.id) ?? '';

    if (hasEnter) {
      // Everything before the first newline is the final part of the command
      const enterIdx = chunk.search(/[\r\n]/);
      const before = chunk.substring(0, enterIdx);
      const command = (current + before).trim();

      if (command.length > 0) {
        const userId: string | undefined = (client as any).user?.sub ?? (client as any).user?.id;
        this.eventsService.create({
          type: 'TERMINAL_CMD',
          title: `Terminal: ${command.substring(0, 60)}`,
          description: command.substring(0, 2000),
          metadata: { command: command.substring(0, 2000), sessionId: data.sessionId },
          userId,
          severity: 'INFO',
        }).catch(() => {});
      }

      // Reset buffer (keep any chars after the newline if the chunk had more)
      const afterEnter = chunk.substring(chunk.search(/[\r\n]/) + 1).replace(/[\r\n]/g, '');
      this.cmdBuffers.set(client.id, afterEnter);
    } else {
      // Cap buffer to avoid memory abuse
      this.cmdBuffers.set(client.id, (current + chunk).slice(-4000));
    }
  }

  @SubscribeMessage(WsEvents.TERMINAL_RESIZE)
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; cols: number; rows: number },
  ) {
    this.assertOwnsSession(client, data?.sessionId);
    const cols = Math.min(Math.max(data.cols || 80, 20), 500);
    const rows = Math.min(Math.max(data.rows || 24, 5), 200);
    this.sessions.get(data.sessionId)?.resize(cols, rows);
  }

  @SubscribeMessage(WsEvents.TERMINAL_CLOSE)
  handleClose(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    this.assertOwnsSession(client, data?.sessionId);
    this.sessions.get(data.sessionId)?.close();
    this.sessions.delete(data.sessionId);
    this.sessionOwners.get(client.id)?.delete(data.sessionId);
  }

  handleDisconnect(client: Socket) {
    const ids = this.sessionOwners.get(client.id);
    if (ids) {
      for (const id of ids) {
        try { this.sessions.get(id)?.close(); } catch {}
        this.sessions.delete(id);
        this.shellChildren.delete(id);
      }
      this.sessionOwners.delete(client.id);
    }
    this.cmdBuffers.delete(client.id);
  }
}

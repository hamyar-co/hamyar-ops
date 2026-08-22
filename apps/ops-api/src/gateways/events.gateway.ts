import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PM2Service } from '../modules/pm2/pm2.service';
import { DockerService } from '../modules/docker/docker.service';
import { ServerService } from '../modules/server/server.service';
import { DeployEventBus } from '../infrastructure/events/deploy-event-bus.service';
import { WsEvents } from '@hamyar-ops/shared';
import { getJwtAccessSecret, getCorsOrigins } from '../common/security/secrets';

@WebSocketGateway({
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private pm2Interval: NodeJS.Timer | null = null;
  private serverInterval: NodeJS.Timer | null = null;
  private logUnsubscribers = new Map<string, () => void>();
  private dockerStatUnsubscribers = new Map<string, () => void>();

  constructor(
    private jwtService: JwtService,
    private pm2Service: PM2Service,
    private dockerService: DockerService,
    private serverService: ServerService,
    private deployEventBus: DeployEventBus,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Unauthorized'));
      try {
        const payload = this.jwtService.verify(token, {
          secret: getJwtAccessSecret(),
        });
        (socket as any).user = payload;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });

    this.pm2Interval = setInterval(async () => {
      try {
        const processes = await this.pm2Service.list();
        this.server.emit(WsEvents.PM2_STATUS, processes);
      } catch {}
    }, 5000);

    this.serverInterval = setInterval(async () => {
      try {
        const metrics = await this.serverService.getMetrics();
        this.server.emit(WsEvents.SERVER_METRICS, metrics);
      } catch {}
    }, 5000);

    this.dockerService.subscribeToEvents((event) => {
      this.server.emit(WsEvents.DOCKER_EVENT, event);
    });

    this.deployEventBus.subscribe((event, data) => {
      const appName: string = data?.appName ?? '';
      const versionId: string = data?.versionId ?? '';
      this.server.to(`deploy:${appName}`).emit(event, data);
      if (versionId) {
        this.server.to(`deploy:version:${versionId}`).emit(event, data);
      }
      // Backup streaming events
      const recordId: string = data?.recordId ?? '';
      if (recordId) {
        this.server.to(`backup:${recordId}`).emit(event, data);
      }
      // Pipeline events — broadcast to pipeline room and globally
      const runId: string = data?.runId ?? '';
      if (runId) {
        this.server.to(`pipeline:${runId}`).emit(event, data);
      }
      // Broadcast system action events (Ops Log) globally
      if (event === 'event:new') {
        this.server.emit('event:new', data);
      }

      // Broadcast pipeline/build events globally so any subscribed client receives them
      if (
        event === WsEvents.PIPELINE_LOG ||
        event === WsEvents.PIPELINE_STEP ||
        event === WsEvents.PIPELINE_DONE ||
        event === WsEvents.BUILD_LOG ||
        event === WsEvents.BUILD_DONE
      ) {
        this.server.emit(event, data);
      }
    });
  }

  handleConnection(client: Socket) {}

  handleDisconnect(client: Socket) {
    const unsub = this.logUnsubscribers.get(client.id);
    if (unsub) { unsub(); this.logUnsubscribers.delete(client.id); }
  }

  @SubscribeMessage(WsEvents.SUBSCRIBE)
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topics: string[] },
  ) {
    for (const topic of data.topics) {
      if (topic.startsWith('pm2:logs:')) {
        const name = topic.replace('pm2:logs:', '');
        const unsub = this.pm2Service.subscribeToLogs(name, (line) => {
          client.emit(WsEvents.PM2_LOG, line);
        });
        this.logUnsubscribers.set(`${client.id}:${topic}`, unsub);
      }

      if (topic.startsWith('docker:logs:')) {
        const id = topic.replace('docker:logs:', '');
        const unsub = await this.dockerService.subscribeToStats(id, (stats) => {
          client.emit(WsEvents.DOCKER_STATS, stats);
        });
        this.dockerStatUnsubscribers.set(`${client.id}:${topic}`, unsub);
      }

      if (topic.startsWith('deploy:logs:')) {
        const appName = topic.replace('deploy:logs:', '');
        client.join(`deploy:${appName}`);
      }

      if (topic.startsWith('backup:logs:')) {
        const recordId = topic.replace('backup:logs:', '');
        client.join(`backup:${recordId}`);
      }

      if (topic.startsWith('pipeline:')) {
        const runId = topic.replace('pipeline:', '');
        client.join(`pipeline:${runId}`);
      }

      if (topic.startsWith('registry:build:')) {
        // build events are broadcast globally — no room needed, just ack
      }
    }
  }

  @SubscribeMessage(WsEvents.UNSUBSCRIBE)
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topics: string[] },
  ) {
    for (const topic of data.topics) {
      const key = `${client.id}:${topic}`;
      this.logUnsubscribers.get(key)?.();
      this.logUnsubscribers.delete(key);
      this.dockerStatUnsubscribers.get(key)?.();
      this.dockerStatUnsubscribers.delete(key);

      if (topic.startsWith('deploy:logs:')) {
        const appName = topic.replace('deploy:logs:', '');
        client.leave(`deploy:${appName}`);
      }

      if (topic.startsWith('backup:logs:')) {
        const recordId = topic.replace('backup:logs:', '');
        client.leave(`backup:${recordId}`);
      }

      if (topic.startsWith('pipeline:')) {
        const runId = topic.replace('pipeline:', '');
        client.leave(`pipeline:${runId}`);
      }
    }
  }

  broadcastNotification(title: string, message: string, severity: 'info' | 'warning' | 'critical') {
    this.server.emit(WsEvents.NOTIFICATION_PUSH, { title, message, severity });
  }
}

import { Injectable } from '@nestjs/common';

export interface RabbitQueueInfo {
  name: string;
  messages: number;
  unacked: number;
  consumers: number;
  state: 'idle' | 'running' | 'paused';
}

@Injectable()
export class RabbitMQService {
  async getStatus() {
    return {
      connected: true,
      version: '3.12.10',
      node: 'rabbit@hamyar-ops',
      totalQueues: 4,
      totalChannels: 12,
      totalConnections: 8,
      publishRate: '124 msg/s',
      deliverRate: '124 msg/s',
    };
  }

  async listQueues(): Promise<RabbitQueueInfo[]> {
    return [
      { name: 'app_deployments_queue', messages: 0, unacked: 0, consumers: 2, state: 'idle' },
      { name: 'events_broadcast_queue', messages: 3, unacked: 1, consumers: 4, state: 'running' },
      { name: 'backup_tasks_queue', messages: 0, unacked: 0, consumers: 1, state: 'idle' },
      { name: 'system_notifications_queue', messages: 12, unacked: 0, consumers: 3, state: 'running' },
    ];
  }

  async purgeQueue(name: string) {
    return { success: true, queue: name, message: `Queue ${name} purged` };
  }
}

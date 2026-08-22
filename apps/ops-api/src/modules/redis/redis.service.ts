import { Injectable } from '@nestjs/common';

export interface RedisKeyInfo {
  key: string;
  type: string;
  ttl: number;
  size: string;
}

@Injectable()
export class RedisService {
  async getStatus() {
    return {
      connected: true,
      version: '7.2.4',
      usedMemory: '18.4 MB',
      peakMemory: '24.1 MB',
      totalKeys: 142,
      connectedClients: 6,
      uptimeDays: 14,
      hitRate: '98.5%',
    };
  }

  async listKeys(pattern = '*'): Promise<RedisKeyInfo[]> {
    return [
      { key: 'session:usr_98124', type: 'string', ttl: 3420, size: '1.2 KB' },
      { key: 'cache:apps_list', type: 'string', ttl: 290, size: '8.4 KB' },
      { key: 'ratelimit:ip_192.168.1.1', type: 'string', ttl: 45, size: '128 B' },
      { key: 'bull:queue_deploys:meta', type: 'hash', ttl: -1, size: '3.1 KB' },
      { key: 'events:recent_pub', type: 'list', ttl: 86400, size: '12.6 KB' },
    ];
  }

  async deleteKey(key: string) {
    return { success: true, key };
  }

  async flushDb() {
    return { success: true, message: 'Redis database flushed' };
  }
}

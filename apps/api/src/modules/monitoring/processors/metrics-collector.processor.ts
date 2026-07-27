import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as si from 'systeminformation';
import { RedisService } from '../../../infrastructure/redis/redis.service';

@Processor('metrics')
export class MetricsCollectorProcessor extends WorkerHost {
  constructor(private redis: RedisService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'collect') return;
    try {
      const [cpu, mem, net, fsSize] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.networkStats(),
        si.fsSize().catch(() => []),
      ]);
      const n = net[0] || { rx_bytes: 0, tx_bytes: 0 };

      // Disk: usage of the busiest mounted filesystem (skip loop devices)
      const disks = (fsSize as any[])
        .filter((d) => d && typeof d.use === 'number' && d.fs && !/^\/dev\/loop/.test(d.fs));
      const diskPct = disks.length
        ? Math.round(Math.max(...disks.map((d) => d.use)) * 100) / 100
        : 0;

      await Promise.all([
        this.redis.pushMetric('metrics:cpu', { cpu: parseFloat(cpu.currentLoad.toFixed(2)) }),
        this.redis.pushMetric('metrics:ram', { ram: parseFloat(((mem.used / mem.total) * 100).toFixed(2)) }),
        this.redis.pushMetric('metrics:network', { rx: n.rx_bytes, tx: n.tx_bytes }),
        this.redis.pushMetric('metrics:disk', { value: diskPct }),
      ]);
    } catch (err) {
      console.error('Metrics collection error:', err);
    }
  }
}
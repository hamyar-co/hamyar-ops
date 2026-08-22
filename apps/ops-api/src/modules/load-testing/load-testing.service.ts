import { Injectable, BadRequestException } from '@nestjs/common';
import * as autocannon from 'autocannon';
import { assertSafeOutboundUrl } from '../../common/security/ssrf';

const MAX_CONNECTIONS = 50;
const MAX_DURATION = 60;

@Injectable()
export class LoadTestingService {
  async runTest(url: string, connections: number = 10, duration: number = 10) {
    if (!url) {
      throw new BadRequestException('Target URL is required');
    }

    // SSRF protection — block private/local/metadata targets
    const safeUrl = await assertSafeOutboundUrl(url);

    const conn = Math.min(Math.max(1, connections || 10), MAX_CONNECTIONS);
    const dur = Math.min(Math.max(1, duration || 10), MAX_DURATION);

    try {
      const result = await autocannon({
        url: safeUrl.toString(),
        connections: conn,
        pipelining: 1,
        duration: dur,
      });

      return {
        success: true,
        data: {
          url: safeUrl.toString(),
          connections: conn,
          duration: dur,
          requests: result.requests,
          latency: result.latency,
          throughput: result.throughput,
          errors: result.errors,
          timeouts: result.timeouts,
          non2xx: result.non2xx,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Load test failed: ${error.message}`);
    }
  }
}

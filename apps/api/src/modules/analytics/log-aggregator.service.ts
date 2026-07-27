import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class LogAggregatorService {
  private readonly logger = new Logger(LogAggregatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async aggregateMinute() {
    this.logger.debug('Aggregating minute stats...');
    const oneMinuteAgo = new Date(Date.now() - 60000);
    oneMinuteAgo.setSeconds(0, 0);

    const startTime = oneMinuteAgo;
    const endTime = new Date(startTime.getTime() + 60000);

    const requests = await this.prisma.rawRequest.findMany({
      where: {
        timestamp: {
          gte: startTime,
          lt: endTime,
        },
      },
    });

    if (requests.length === 0) return;

    let bandwidth = 0n;
    let pageViews = 0;
    let botCount = 0;
    let success = 0;
    let errors = 0;
    const uniqueIps = new Set<string>();

    for (const req of requests) {
      bandwidth += BigInt(req.size || 0);
      if (!req.isBot) {
        pageViews++;
        if (req.ip) uniqueIps.add(req.ip);
      } else {
        botCount++;
      }

      if ((req.status || 0) >= 400) {
        errors++;
      } else {
        success++;
      }
    }

    await this.prisma.analyticsMinuteStat.upsert({
      where: { timestamp: startTime },
      update: {
        bandwidth,
        pageViews,
        visitors: uniqueIps.size,
        botCount,
        success,
        errors,
      },
      create: {
        timestamp: startTime,
        bandwidth,
        pageViews,
        visitors: uniqueIps.size,
        botCount,
        success,
        errors,
      },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async aggregateHour() {
    this.logger.debug('Aggregating hour stats...');
    const oneHourAgo = new Date(Date.now() - 3600000);
    oneHourAgo.setMinutes(0, 0, 0);
    const startTime = oneHourAgo;
    const endTime = new Date(startTime.getTime() + 3600000);

    const stats = await this.prisma.analyticsMinuteStat.findMany({
      where: { timestamp: { gte: startTime, lt: endTime } },
    });

    if (stats.length === 0) return;

    let bandwidth = 0n;
    let pageViews = 0;
    let botCount = 0;
    let success = 0;
    let errors = 0;

    const rawReqs = await this.prisma.rawRequest.findMany({
      where: { timestamp: { gte: startTime, lt: endTime }, isBot: false },
      select: { ip: true },
    });
    const uniqueIps = new Set(rawReqs.map((r) => r.ip).filter(Boolean) as string[]);

    for (const st of stats) {
      bandwidth += BigInt(st.bandwidth);
      pageViews += st.pageViews;
      botCount += st.botCount;
      success += st.success;
      errors += st.errors;
    }

    await this.prisma.analyticsHourStat.upsert({
      where: { timestamp: startTime },
      update: {
        bandwidth,
        pageViews,
        visitors: uniqueIps.size,
        botCount,
        success,
        errors,
      },
      create: {
        timestamp: startTime,
        bandwidth,
        pageViews,
        visitors: uniqueIps.size,
        botCount,
        success,
        errors,
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async aggregateDay() {
    this.logger.debug('Aggregating day stats...');
    const oneDayAgo = new Date(Date.now() - 86400000);
    oneDayAgo.setHours(0, 0, 0, 0);
    const startTime = oneDayAgo;
    const endTime = new Date(startTime.getTime() + 86400000);

    const stats = await this.prisma.analyticsHourStat.findMany({
      where: { timestamp: { gte: startTime, lt: endTime } },
    });

    if (stats.length === 0) return;

    let bandwidth = 0n;
    let pageViews = 0;
    let botCount = 0;
    let success = 0;
    let errors = 0;

    const rawReqs = await this.prisma.rawRequest.findMany({
      where: { timestamp: { gte: startTime, lt: endTime }, isBot: false },
      select: { ip: true },
    });
    const uniqueIps = new Set(rawReqs.map((r) => r.ip).filter(Boolean) as string[]);

    for (const st of stats) {
      bandwidth += BigInt(st.bandwidth);
      pageViews += st.pageViews;
      botCount += st.botCount;
      success += st.success;
      errors += st.errors;
    }

    await this.prisma.analyticsDayStat.upsert({
      where: { timestamp: startTime },
      update: {
        bandwidth,
        pageViews,
        visitors: uniqueIps.size,
        botCount,
        success,
        errors,
      },
      create: {
        timestamp: startTime,
        bandwidth,
        pageViews,
        visitors: uniqueIps.size,
        botCount,
        success,
        errors,
      },
    });
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AnalyticsOverviewDto, AnalyticsTimelineDto } from '@hamyar-ops/shared';
// import { AuthGuard } from '@nestjs/passport';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async getOverview(@Query() query: AnalyticsOverviewDto) {
    const dayStats = await this.prisma.analyticsDayStat.findMany({
      orderBy: { timestamp: 'desc' },
      take: 7,
    });
    return { data: dayStats };
  }

  @Get('timeline')
  async getTimeline(@Query() query: AnalyticsTimelineDto) {
    const hourStats = await this.prisma.analyticsHourStat.findMany({
      orderBy: { timestamp: 'desc' },
      take: 24,
    });
    return { data: hourStats };
  }
}

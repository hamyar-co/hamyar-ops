import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { LogParserService } from './log-parser.service';
import { LogAggregatorService } from './log-aggregator.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'analytics',
    }),
  ],
  controllers: [AnalyticsController],
  providers: [LogParserService, LogAggregatorService],
  exports: [LogParserService, LogAggregatorService],
})
export class AnalyticsModule {}

import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AppScheduleDto, CreateAppScheduleDto, UpdateAppScheduleDto } from '@hamyar-ops/shared';

@Injectable()
export class SchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue('app-scheduler') private schedulerQueue: Queue,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const schedules = await this.prisma.appSchedule.findMany({ where: { enabled: true } });
    for (const s of schedules) {
      await this.registerJob(s.id, s.appName, s.cron, s.action);
    }
  }

  private jobKey(scheduleId: string) {
    return `schedule:${scheduleId}`;
  }

  private async registerJob(scheduleId: string, appName: string, cron: string, action: string) {
    await this.schedulerQueue.add(
      'run',
      { scheduleId, appName, action },
      {
        repeat: { pattern: cron },
        jobId: this.jobKey(scheduleId),
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    );
  }

  private async removeJob(scheduleId: string) {
    const repeatableJobs = await this.schedulerQueue.getRepeatableJobs();
    const job = repeatableJobs.find((j) => j.id === this.jobKey(scheduleId));
    if (job) {
      await this.schedulerQueue.removeRepeatableByKey(job.key);
    }
  }

  async getSchedules(pm2Name: string): Promise<AppScheduleDto[]> {
    const schedules = await this.prisma.appSchedule.findMany({
      where: { appName: pm2Name },
      orderBy: { id: 'asc' },
    });
    return schedules.map(this.toDto);
  }

  async createSchedule(pm2Name: string, dto: CreateAppScheduleDto): Promise<AppScheduleDto> {
    const app = await this.prisma.appConfig.findUnique({ where: { pm2Name } });
    if (!app) throw new NotFoundException(`App ${pm2Name} not found`);

    const schedule = await this.prisma.appSchedule.create({
      data: {
        appName: pm2Name,
        cron: dto.cron,
        action: dto.action ?? 'restart',
        label: dto.label,
        enabled: dto.enabled ?? true,
      },
    });

    if (schedule.enabled) {
      await this.registerJob(schedule.id, pm2Name, schedule.cron, schedule.action);
    }

    return this.toDto(schedule);
  }

  async updateSchedule(scheduleId: string, dto: UpdateAppScheduleDto): Promise<AppScheduleDto> {
    const existing = await this.prisma.appSchedule.findUnique({ where: { id: scheduleId } });
    if (!existing) throw new NotFoundException('Schedule not found');

    await this.removeJob(scheduleId);

    const schedule = await this.prisma.appSchedule.update({
      where: { id: scheduleId },
      data: dto,
    });

    if (schedule.enabled) {
      await this.registerJob(schedule.id, schedule.appName, schedule.cron, schedule.action);
    }

    return this.toDto(schedule);
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    await this.removeJob(scheduleId);
    await this.prisma.appSchedule.delete({ where: { id: scheduleId } });
  }

  private toDto(s: any): AppScheduleDto {
    return {
      id: s.id,
      appName: s.appName,
      cron: s.cron,
      action: s.action,
      enabled: s.enabled,
      label: s.label,
      lastRanAt: s.lastRanAt?.toISOString() ?? null,
    };
  }
}

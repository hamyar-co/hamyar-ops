import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { CreateAppScheduleDto, UpdateAppScheduleDto } from '@hamyar-ops/shared';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('applications/:name/schedules')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get()
  getSchedules(@Param('name') name: string) {
    return this.schedulerService.getSchedules(name);
  }

  @Post()
  @Roles('ADMIN')
  createSchedule(@Param('name') name: string, @Body() dto: CreateAppScheduleDto) {
    return this.schedulerService.createSchedule(name, dto);
  }

  @Put(':scheduleId')
  @Roles('ADMIN')
  updateSchedule(@Param('scheduleId') scheduleId: string, @Body() dto: UpdateAppScheduleDto) {
    return this.schedulerService.updateSchedule(scheduleId, dto);
  }

  @Delete(':scheduleId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSchedule(@Param('scheduleId') scheduleId: string) {
    return this.schedulerService.deleteSchedule(scheduleId);
  }
}

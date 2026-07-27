import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CronJobsService } from './cron-jobs.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CronJobDto, CreateCronJobDto, UpdateCronJobDto, CronRunResultDto } from '@hamyar-ops/shared';

@Controller('cron')
export class CronJobsController {
  constructor(private cronJobs: CronJobsService) {}

  @Get()
  list(@Query('serverId') serverId?: string): Promise<CronJobDto[]> {
    return this.cronJobs.list(serverId);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<CronJobDto> {
    return this.cronJobs.get(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateCronJobDto): Promise<CronJobDto> {
    return this.cronJobs.create(dto);
  }

  @Roles('ADMIN')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCronJobDto): Promise<CronJobDto> {
    return this.cronJobs.update(id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.cronJobs.delete(id);
  }

  @Roles('ADMIN')
  @Post(':id/run')
  runNow(@Param('id') id: string): Promise<CronRunResultDto> {
    return this.cronJobs.runNow(id);
  }

  @Roles('ADMIN')
  @Patch(':id/toggle')
  toggle(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ): Promise<CronJobDto> {
    return this.cronJobs.toggle(id, body.enabled);
  }
}

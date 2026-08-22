import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { AnsibleService } from './ansible.service';
import { Roles } from '../../common/decorators/roles.decorator';
import type {
  AnsiblePlaybookDto,
  AnsibleJobDto,
  CreateAnsiblePlaybookDto,
  RunAnsiblePlaybookDto,
} from '@hamyar-ops/shared';

@Controller('ansible')
export class AnsibleController {
  constructor(private ansible: AnsibleService) {}

  // ─── Playbooks ─────────────────────────────────────────────────────────────

  @Get('playbooks')
  listPlaybooks(): Promise<AnsiblePlaybookDto[]> {
    return this.ansible.listPlaybooks();
  }

  @Post('playbooks')
  @Roles('ADMIN')
  createPlaybook(@Body() dto: CreateAnsiblePlaybookDto): Promise<AnsiblePlaybookDto> {
    return this.ansible.createPlaybook(dto);
  }

  @Get('playbooks/:id')
  getPlaybook(@Param('id') id: string): Promise<AnsiblePlaybookDto> {
    return this.ansible.getPlaybook(id);
  }

  @Put('playbooks/:id')
  @Roles('ADMIN')
  updatePlaybook(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAnsiblePlaybookDto>,
  ): Promise<AnsiblePlaybookDto> {
    return this.ansible.updatePlaybook(id, dto);
  }

  @Delete('playbooks/:id')
  @Roles('ADMIN')
  deletePlaybook(@Param('id') id: string): Promise<void> {
    return this.ansible.deletePlaybook(id);
  }

  @Post('playbooks/:id/run')
  @Roles('ADMIN')
  runPlaybook(
    @Param('id') id: string,
    @Body() dto: RunAnsiblePlaybookDto,
    @Request() req: any,
  ): Promise<AnsibleJobDto> {
    const userId = req.user?.id ?? req.user?.sub ?? undefined;
    return this.ansible.runPlaybook(id, dto, userId);
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  @Get('jobs')
  listJobs(@Query('playbookId') playbookId?: string): Promise<AnsibleJobDto[]> {
    return this.ansible.listJobs(playbookId);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string): Promise<AnsibleJobDto> {
    return this.ansible.getJob(id);
  }

  // ─── Drift ─────────────────────────────────────────────────────────────────

  @Get('drift/:serverId')
  getDriftReport(@Param('serverId') serverId: string): Promise<AnsibleJobDto> {
    return this.ansible.getDriftReport(serverId);
  }
}

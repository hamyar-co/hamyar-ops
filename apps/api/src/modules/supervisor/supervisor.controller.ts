import { Controller, Get, Post, Put, Delete, Patch, Param, Body, Query } from '@nestjs/common';
import { SupervisorService } from './supervisor.service';
import { Roles } from '../../common/decorators/roles.decorator';
import type { CreateSupervisorRuleDto, UpdateSupervisorRuleDto } from '@hamyar-ops/shared';

@Controller('supervisor')
export class SupervisorController {
  constructor(private supervisorService: SupervisorService) {}

  @Get()
  list(@Query('serverId') serverId?: string) {
    return this.supervisorService.list(serverId);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateSupervisorRuleDto) {
    return this.supervisorService.create(dto);
  }

  @Roles('ADMIN')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupervisorRuleDto) {
    return this.supervisorService.update(id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.supervisorService.delete(id);
  }

  @Roles('ADMIN')
  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.supervisorService.toggle(id);
  }

  @Roles('ADMIN')
  @Post(':id/check')
  checkOne(@Param('id') id: string) {
    return this.supervisorService.checkRule(id);
  }

  @Roles('ADMIN')
  @Post('check-all')
  checkAll() {
    return this.supervisorService.checkAll();
  }
}

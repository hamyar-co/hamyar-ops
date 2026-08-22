import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TerraformService } from './terraform.service';
import { Roles } from '../../common/decorators/roles.decorator';
import type { CreateTerraformWorkspaceDto } from '@hamyar-ops/shared';

@Controller('terraform')
export class TerraformController {
  constructor(private terraform: TerraformService) {}

  @Get('workspaces')
  listWorkspaces() {
    return this.terraform.listWorkspaces();
  }

  @Roles('ADMIN')
  @Post('workspaces')
  createWorkspace(@Body() body: CreateTerraformWorkspaceDto) {
    return this.terraform.createWorkspace(body);
  }

  @Get('workspaces/:id')
  getWorkspace(@Param('id') id: string) {
    return this.terraform.getWorkspace(id);
  }

  @Roles('ADMIN')
  @Delete('workspaces/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteWorkspace(@Param('id') id: string) {
    return this.terraform.deleteWorkspace(id);
  }

  @Get('workspaces/:id/runs')
  getRuns(@Param('id') id: string) {
    return this.terraform.getRuns(id);
  }

  @Roles('ADMIN')
  @Post('workspaces/:id/run')
  runCommand(
    @Param('id') id: string,
    @Body() body: { command: 'init' | 'plan' | 'apply' | 'destroy' },
  ) {
    return this.terraform.runCommand(id, body.command);
  }

  @Get('templates')
  getTemplates() {
    return this.terraform.getTemplates();
  }
}

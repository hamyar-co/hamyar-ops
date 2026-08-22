import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { CreatePipelineDto, TriggerPipelineDto } from '@hamyar-ops/shared';

@Controller('pipelines')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  listPipelines() {
    return this.pipelineService.listPipelines();
  }

  @Post()
  @Roles('ADMIN')
  createPipeline(@Body() body: CreatePipelineDto) {
    return this.pipelineService.createPipeline(body);
  }

  // Must come before :id routes to avoid conflict
  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.pipelineService.getRun(runId);
  }

  @Post('runs/:runId/rollback')
  @Roles('ADMIN')
  rollbackRun(@Param('runId') runId: string) {
    return this.pipelineService.rollbackRun(runId);
  }

  @Public()
  @Post('webhook/:token')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Param('token') token: string,
    @Body() body: { ref?: string; sha?: string; branch?: string },
  ) {
    return this.pipelineService.handleWebhook(token, body);
  }

  @Get(':id')
  getPipeline(@Param('id') id: string) {
    return this.pipelineService.getPipeline(id);
  }

  @Put(':id')
  @Roles('ADMIN')
  updatePipeline(@Param('id') id: string, @Body() body: Partial<CreatePipelineDto>) {
    return this.pipelineService.updatePipeline(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePipeline(@Param('id') id: string) {
    return this.pipelineService.deletePipeline(id);
  }

  @Patch(':id/toggle')
  @Roles('ADMIN')
  enablePipeline(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    return this.pipelineService.enablePipeline(id, enabled);
  }

  @Post(':id/trigger')
  triggerRun(@Param('id') id: string, @Body() body: TriggerPipelineDto) {
    return this.pipelineService.triggerRun(id, 'manual', body);
  }

  @Get(':id/runs')
  getRuns(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.pipelineService.getRuns(id, limit);
  }
}

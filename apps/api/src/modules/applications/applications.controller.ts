import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  StreamableFile,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateAppConfigApiDto, UpdateAppConfigApiDto } from './dto/applications-api.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // ── List / CRUD ────────────────────────────────────────────────────────────

  @Get()
  findAll() {
    return this.applicationsService.findAll();
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateAppConfigApiDto) {
    return this.applicationsService.create(dto);
  }

  // ── Public webhook (must be before :name param routes) ───────────────────

  @Public()
  @Post('webhook/:name')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Param('name') name: string,
    @Query('secret') secret: string,
    @Body() body: { tag?: string; commitHash?: string; commitMsg?: string; ref?: string },
  ) {
    return this.applicationsService.handleWebhook(name, secret, body);
  }

  // ── CI deploy recording (GitHub Actions calls this with DEPLOY_RECORD_TOKEN) ─
  @Public()
  @Post('deploy-record/:name')
  @HttpCode(HttpStatus.OK)
  recordDeploy(
    @Param('name') name: string,
    @Headers('x-deploy-token') token: string,
    @Body() body: { tag?: string; commitHash?: string; commitMsg?: string; ref?: string; deployedBy?: string; status?: string },
  ) {
    return this.applicationsService.recordCIDeploy(name, token, body);
  }

  // ── Single-app routes ─────────────────────────────────────────────────────

  @Get(':name')
  findOne(@Param('name') name: string) {
    return this.applicationsService.findOne(name);
  }

  @Put(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateAppConfigApiDto) {
    return this.applicationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.applicationsService.remove(id);
  }

  @Get(':name/versions')
  getVersions(
    @Param('name') name: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.applicationsService.getVersions(name, page, limit);
  }

  @Post(':name/deploy')
  @Roles('ADMIN')
  deploy(@Param('name') name: string, @Request() req: any) {
    return this.applicationsService.triggerDeploy(name, req.user?.email ?? 'unknown');
  }

  @Post(':name/rollback/:versionId')
  @Roles('ADMIN')
  rollback(
    @Param('name') name: string,
    @Param('versionId') versionId: string,
    @Request() req: any,
  ) {
    return this.applicationsService.triggerRollback(name, versionId, req.user?.email ?? 'unknown');
  }

  @Get(':name/versions/:versionId/download')
  @Roles('ADMIN')
  async downloadVersion(
    @Param('name') name: string,
    @Param('versionId') versionId: string,
  ): Promise<StreamableFile> {
    const stream = await this.applicationsService.downloadVersionStream(name, versionId);
    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${name}-${versionId}.zip"`,
    });
  }

  @Get(':name/webhook')
  @Roles('ADMIN')
  getWebhookSecret(@Param('name') name: string) {
    return this.applicationsService.getWebhookSecret(name);
  }

  @Get(':name/terminal')
  getTerminalInfo(@Param('name') name: string) {
    return this.applicationsService.getTerminalInfo(name);
  }

  @Post(':name/webhook/rotate')
  @Roles('ADMIN')
  rotateWebhookSecret(@Param('name') name: string) {
    return this.applicationsService.rotateWebhookSecret(name);
  }
}

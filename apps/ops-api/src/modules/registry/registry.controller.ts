import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RegistryService } from './registry.service';
import { Roles } from '../../common/decorators/roles.decorator';
import type { CreateRegistryDto, BuildRequestDto } from '@hamyar-ops/shared';

@Controller('registry')
export class RegistryController {
  constructor(private readonly registryService: RegistryService) {}

  @Get()
  listRegistries() {
    return this.registryService.listRegistries();
  }

  @Post()
  @Roles('ADMIN')
  createRegistry(@Body() body: CreateRegistryDto) {
    return this.registryService.createRegistry(body);
  }

  @Get('builds')
  getRecentBuilds() {
    return this.registryService.getRecentBuilds();
  }

  @Post('build')
  triggerBuild(@Body() body: BuildRequestDto) {
    return this.registryService.triggerBuild(body);
  }

  @Post('pull')
  pullOnServer(
    @Body('serverId') serverId: string,
    @Body('image') image: string,
  ) {
    return this.registryService.pullOnServer(serverId, image);
  }

  @Get(':id')
  getRegistry(@Param('id') id: string) {
    return this.registryService.getRegistry(id);
  }

  @Put(':id')
  @Roles('ADMIN')
  updateRegistry(@Param('id') id: string, @Body() body: Partial<CreateRegistryDto>) {
    return this.registryService.updateRegistry(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRegistry(@Param('id') id: string) {
    return this.registryService.deleteRegistry(id);
  }

  @Post(':id/test')
  testConnection(@Param('id') id: string) {
    return this.registryService.testConnection(id);
  }

  @Get(':id/images')
  listImages(@Param('id') id: string) {
    return this.registryService.listImages(id);
  }
}

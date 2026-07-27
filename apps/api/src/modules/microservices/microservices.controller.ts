import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { MicroservicesService } from './microservices.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateMicroserviceProjectDto, CreateMicroserviceDto, UpdateMicroserviceDto } from '@hamyar-ops/shared';

@Controller('microservices')
@Roles('ADMIN')
export class MicroservicesController {
  constructor(private readonly microservicesService: MicroservicesService) {}

  @Get('projects')
  findAllProjects() {
    return this.microservicesService.findAllProjects();
  }

  @Post('projects')
  createProject(@Body() dto: CreateMicroserviceProjectDto) {
    return this.microservicesService.createProject(dto);
  }

  @Get('projects/:id')
  findProject(@Param('id') id: string) {
    return this.microservicesService.findProjectById(id);
  }

  @Delete('projects/:id')
  deleteProject(@Param('id') id: string) {
    return this.microservicesService.deleteProject(id);
  }

  @Post('services')
  addService(@Body() dto: CreateMicroserviceDto) {
    return this.microservicesService.addService(dto);
  }

  @Put('services/:id')
  updateService(@Param('id') id: string, @Body() dto: UpdateMicroserviceDto) {
    return this.microservicesService.updateService(id, dto);
  }

  @Delete('services/:id')
  removeService(@Param('id') id: string) {
    return this.microservicesService.removeService(id);
  }

  @Get('projects/:id/nginx-config')
  getNginxStatus(@Param('id') id: string) {
    return this.microservicesService.getNginxStatus(id);
  }

  @Post('projects/:id/nginx-apply')
  applyNginxConfig(@Param('id') id: string) {
    return this.microservicesService.applyNginxConfig(id);
  }

  @Post('projects/:id/nginx-disable')
  disableNginxConfig(@Param('id') id: string) {
    return this.microservicesService.disableNginxConfig(id);
  }
}

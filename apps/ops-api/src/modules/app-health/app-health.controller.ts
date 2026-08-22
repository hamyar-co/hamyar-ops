import { Controller, Get, Param } from '@nestjs/common';
import { AppHealthService } from './app-health.service';

@Controller('app-health')
export class AppHealthController {
  constructor(private readonly appHealthService: AppHealthService) {}

  @Get(':name/health')
  getHealth(@Param('name') name: string) {
    return this.appHealthService.getHealth(name);
  }

  @Get(':name/ssl')
  getSsl(@Param('name') name: string) {
    return this.appHealthService.getSsl(name);
  }

  @Get('_/health-all')
  getAllHealth() {
    return this.appHealthService.getAllHealth();
  }

  @Get('_/ssl-all')
  getAllSsl() {
    return this.appHealthService.getAllSsl();
  }
}

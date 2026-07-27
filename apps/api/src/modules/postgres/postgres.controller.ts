import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { PostgresService } from './postgres.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('postgres')
@UseGuards(JwtAuthGuard)
export class PostgresController {
  constructor(private readonly postgresService: PostgresService) {}

  @Get('status')
  getStatus() {
    return this.postgresService.getStatus();
  }

  @Get('databases')
  listDatabases() {
    return this.postgresService.listDatabases();
  }

  @Post('query')
  executeQuery(@Body() body: { query: string }) {
    return this.postgresService.executeQuery(body.query);
  }

  @Post('databases')
  createDatabase(@Body() body: { name: string }) {
    return this.postgresService.createDatabase(body.name);
  }
}

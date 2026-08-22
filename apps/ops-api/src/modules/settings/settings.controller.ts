import { Controller, Get, Patch, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsBoolean()
  @IsOptional()
  api_event_logging_enabled?: boolean;
}

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  getAll() { return this.settings.getAll(); }

  @Roles('ADMIN')
  @Patch()
  updateMany(@Body() body: UpdateSettingsDto) { return this.settings.updateMany(body); }
}

import { Controller, Post, Body } from '@nestjs/common';
import { LoadTestingService } from './load-testing.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsInt, Min, Max, IsUrl } from 'class-validator';

class RunLoadTestDto {
  @IsString()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  url: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  connections?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  duration?: number;
}

@ApiTags('Load Testing')
@Controller('load-testing')
@Roles('ADMIN')
export class LoadTestingController {
  constructor(private readonly loadTestingService: LoadTestingService) {}

  @Post('run')
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Run a load test against a target URL' })
  async runTest(@Body() dto: RunLoadTestDto) {
    return this.loadTestingService.runTest(dto.url, dto.connections, dto.duration);
  }
}

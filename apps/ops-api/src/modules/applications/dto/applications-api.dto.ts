import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { CreateAppConfigDto, UpdateAppConfigDto } from '@hamyar-ops/shared';

export class CreateAppConfigApiDto implements CreateAppConfigDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  pm2Name: string;

  @IsString()
  @IsOptional()
  envPath?: string;

  @IsString()
  @IsOptional()
  deployPath?: string;

  @IsString()
  @IsOptional()
  deployCmd?: string;

  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  healthUrl?: string;

  @IsString()
  @IsOptional()
  domain?: string;

  @IsString()
  @IsOptional()
  containerName?: string;

  @IsString()
  @IsOptional()
  dbType?: string;

  @IsString()
  @IsOptional()
  dbName?: string;

  @IsString()
  @IsOptional()
  serverId?: string;
}

export class UpdateAppConfigApiDto implements UpdateAppConfigDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  envPath?: string;

  @IsString()
  @IsOptional()
  deployPath?: string;

  @IsString()
  @IsOptional()
  deployCmd?: string;

  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  healthUrl?: string;

  @IsString()
  @IsOptional()
  domain?: string;

  @IsString()
  @IsOptional()
  containerName?: string | null;

  @IsString()
  @IsOptional()
  dbType?: string | null;

  @IsString()
  @IsOptional()
  dbName?: string | null;
}

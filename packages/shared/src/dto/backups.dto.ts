export type BackupTargetType = 'app' | 'database' | 'container' | 'compose' | 'full';
export type BackupLocation = 'local' | 's3';

export interface S3ConfigDto {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  usePathStyle: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateS3ConfigDto {
  name: string;
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  usePathStyle?: boolean;
}

export interface UpdateS3ConfigDto {
  name?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  usePathStyle?: boolean;
}

export interface BackupStrategyDto {
  id: string;
  name: string;
  targetType: BackupTargetType;
  targets: string[];
  storage: 'local' | 's3';
  s3ConfigId: string | null;
  scheduleCron: string;
  retentionMax: number;
  excludeNodeModules: boolean;
  enabled: boolean;
  lastRanAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBackupStrategyDto {
  name: string;
  targetType: BackupTargetType;
  targets: string[];
  storage?: 'local' | 's3';
  s3ConfigId?: string;
  scheduleCron: string;
  retentionMax?: number;
  excludeNodeModules?: boolean;
  enabled?: boolean;
}

export interface UpdateBackupStrategyDto {
  name?: string;
  targets?: string[];
  storage?: 'local' | 's3';
  s3ConfigId?: string | null;
  scheduleCron?: string;
  retentionMax?: number;
  excludeNodeModules?: boolean;
  enabled?: boolean;
}

export interface BackupRecordDto {
  id: string;
  strategyId: string | null;
  targetType: BackupTargetType;
  targetName: string;
  storage: BackupLocation;
  sizeBytes: number;
  fileName: string;
  localPath: string | null;
  s3Key: string | null;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  message: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface BackupListDto {
  targetType: BackupTargetType;
  targetName: string;
  records: BackupRecordDto[];
  total: number;
}

export interface RestoreResultDto {
  ok: boolean;
  message: string;
  lines: string[];
}

export interface RunBackupResponseDto {
  recordId: string;
  status: BackupRecordDto['status'];
  message: string;
}

export interface FullBackupDto {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string | null;
  includedApps: string[];
  includedDatabases: string[];
  includedConfigs: string[];
  sshKeys: boolean;
  environmentVariables: boolean;
  dockerConfigs: boolean;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING';
}

export interface CreateFullBackupDto {
  name?: string;
  includeApps: boolean;
  includeDatabases: boolean;
  includeSshKeys: boolean;
  includeEnvVars: boolean;
  includeDockerConfigs: boolean;
  storage: 'local' | 's3';
  s3ConfigId?: string;
}

export interface RestoreFullBackupDto {
  backupId: string;
  targetServer?: string;
  skipDependencies?: boolean;
}
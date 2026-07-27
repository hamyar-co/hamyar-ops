export type DeployStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';

export interface AppConfigDto {
  id: string;
  name: string;
  pm2Name: string;
  envPath: string | null;
  deployPath: string | null;
  deployCmd: string | null;
  repoUrl: string | null;
  branch: string | null;
  healthUrl: string | null;
  domain: string | null;
  containerName: string | null;
  dbType: string | null;
  dbName: string | null;
  serverId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AppKind = 'pm2' | 'docker' | 'static' | 'unknown';

export interface AppTerminalInfoDto {
  pm2Name: string;
  kind: AppKind;
  deployPath: string | null;
  containerId: string | null;
  containerName: string | null;
  command: string | null;
}

export interface CreateAppConfigDto {
  name: string;
  pm2Name: string;
  envPath?: string;
  deployPath?: string;
  deployCmd?: string;
  repoUrl?: string;
  branch?: string;
  healthUrl?: string;
  domain?: string;
  containerName?: string;
  dbType?: string;
  dbName?: string;
  serverId?: string;
}

export interface UpdateAppConfigDto {
  name?: string;
  envPath?: string;
  deployPath?: string;
  deployCmd?: string;
  repoUrl?: string;
  branch?: string;
  healthUrl?: string;
  domain?: string;
  containerName?: string | null;
  dbType?: string | null;
  dbName?: string | null;
}

export interface AppVersionDto {
  id: string;
  appName: string;
  tag: string | null;
  commitHash: string | null;
  commitMsg: string | null;
  deployedBy: string | null;
  status: DeployStatus;
  startedAt: string;
  finishedAt: string | null;
}

export interface AppScheduleDto {
  id: string;
  appName: string;
  cron: string;
  action: string;
  enabled: boolean;
  label: string | null;
  lastRanAt: string | null;
}

export interface CreateAppScheduleDto {
  cron: string;
  action?: string;
  label?: string;
  enabled?: boolean;
}

export interface UpdateAppScheduleDto {
  cron?: string;
  action?: string;
  label?: string;
  enabled?: boolean;
}

export interface EnvVarDto {
  key: string;
  value: string;
  comment?: string;
}

export interface EnvFileDto {
  appName: string;
  envPath: string;
  vars: EnvVarDto[];
}

export interface AppHealthDto {
  appName: string;
  healthy: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  consecutiveFailures: number;
  uptimePercent: number;
  checkedAt: string;
}

export interface AppSslDto {
  appName: string;
  domain: string;
  daysRemaining: number | null;
  expiresAt: string | null;
  issuer: string | null;
  valid: boolean;
  checkedAt: string;
}

export interface DeployStartEventDto {
  appName: string;
  versionId: string;
}

export interface DeployLogLineEventDto {
  appName: string;
  versionId: string;
  line: string;
  stream: 'stdout' | 'stderr';
}

export interface DeployDoneEventDto {
  appName: string;
  versionId: string;
  status: DeployStatus;
  exitCode: number | null;
}

export type IncidentStatus = 'UP' | 'DOWN' | 'DEGRADED';

export interface AppIncidentDto {
  id: string;
  appName: string;
  status: IncidentStatus;
  title: string;
  description: string | null;
  startedAt: string;
  resolvedAt: string | null;
  durationMs: number | null;
  events: AppIncidentEventDto[];
}

export interface AppIncidentEventDto {
  id: string;
  incidentId: string;
  status: IncidentStatus;
  message: string | null;
  recordedAt: string;
}

export interface SystemStatusDto {
  overall: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  summary: {
    total: number;
    operational: number;
    degraded: number;
    down: number;
  };
  apps: SystemAppStatusDto[];
  lastUpdated: string;
}

export interface SystemAppStatusDto {
  appName: string;
  name: string;
  status: IncidentStatus;
  health: AppHealthDto | null;
  activeIncident: AppIncidentDto | null;
  uptimePercent: number;
  responseTimeMs: number | null;
}

export interface StatusTimelineDto {
  date: string;
  apps: Record<string, IncidentStatus>;
}

export interface StatusTimelineBucketDto {
  label: string;
  from: string;
  to: string;
  overallUptime: number; // 0..100
  apps: Record<string, number>; // pm2Name -> uptime % for that bucket
}

export interface StatusOverviewDto {
  period: 'live' | 'hourly' | 'daily' | 'monthly';
  daysOfHistory: number;
  buckets: StatusTimelineBucketDto[];
  apps: string[];
  overallUptime: number; // across whole period
  perAppUptime: Record<string, number>; // across whole period
}

export interface CronJobDto {
  id: string;
  serverId: string | null;
  serverName?: string | null;
  title: string;
  command: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunOutput: string | null;
  lastRunStatus: 'SUCCESS' | 'FAILED' | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCronJobDto {
  serverId?: string;
  title: string;
  command: string;
  cronExpression: string;
  enabled?: boolean;
}

export interface UpdateCronJobDto {
  title?: string;
  command?: string;
  cronExpression?: string;
  enabled?: boolean;
}

export interface CronRunResultDto {
  jobId: string;
  output: string;
  exitCode: number;
  duration: number;
}

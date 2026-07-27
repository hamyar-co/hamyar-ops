export type PipelineTrigger = 'manual' | 'webhook' | 'schedule';
export type PipelineStrategy = 'rolling' | 'blue-green' | 'restart';
export type PipelineBuildMode = 'ci' | 'local' | 'remote';
export type PipelineStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
export type StepName = 'build' | 'push' | 'deploy' | 'verify' | 'rollback';

export interface PipelineDto {
  id: string;
  name: string;
  appName: string | null;
  serverId: string | null;
  serverName?: string | null;
  trigger: PipelineTrigger;
  webhookToken: string | null;
  webhookUrl?: string | null;
  cron: string | null;
  strategy: PipelineStrategy;
  buildMode: PipelineBuildMode;
  registryId: string | null;
  imageTag: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun?: PipelineRunDto | null;
}

export interface PipelineRunDto {
  id: string;
  pipelineId: string;
  pipelineName?: string;
  status: PipelineStatus;
  trigger: string | null;
  commitSha: string | null;
  branch: string | null;
  startedAt: string;
  finishedAt: string | null;
  steps: PipelineStepDto[];
}

export interface PipelineStepDto {
  id: string;
  runId: string;
  name: StepName;
  status: PipelineStatus;
  output: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CreatePipelineDto {
  name: string;
  appName?: string;
  serverId?: string;
  trigger?: PipelineTrigger;
  cron?: string;
  strategy?: PipelineStrategy;
  buildMode?: PipelineBuildMode;
  registryId?: string;
  imageTag?: string;
  enabled?: boolean;
}

export interface TriggerPipelineDto {
  commitSha?: string;
  branch?: string;
  imageTag?: string;
}

export interface PipelineStepEvent {
  runId: string;
  pipelineId: string;
  stepId: string;
  stepName: StepName;
  status: PipelineStatus;
  line?: string;
}

export interface PipelineDoneEvent {
  runId: string;
  pipelineId: string;
  status: PipelineStatus;
}

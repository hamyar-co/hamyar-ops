export interface TerraformPlanSummary {
  add: number;
  change: number;
  destroy: number;
}

export interface TerraformWorkspaceDto {
  id: string;
  name: string;
  description: string | null;
  workingDir: string;
  stateBackend: 'local' | 's3';
  s3ConfigId: string | null;
  s3Key: string | null;
  variables: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  lastRun?: TerraformRunDto | null;
}

export interface TerraformRunDto {
  id: string;
  workspaceId: string;
  command: 'init' | 'plan' | 'apply' | 'destroy';
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  output: string | null;
  planSummary: TerraformPlanSummary | null;
  triggeredBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CreateTerraformWorkspaceDto {
  name: string;
  description?: string;
  stateBackend?: 'local' | 's3';
  s3ConfigId?: string;
  s3Key?: string;
  variables?: Record<string, string>;
  templateKey?: 'server-bootstrap' | 'web-app-stack' | 'docker-stack' | 'monitoring-stack';
  templateVars?: Record<string, string>;
}

export interface TerraformModuleTemplate {
  key: string;
  name: string;
  description: string;
  variables: Array<{ name: string; description: string; required: boolean; default?: string }>;
}

export interface TerraformLogEvent {
  runId: string;
  workspaceId: string;
  line: string;
  stream: 'stdout' | 'stderr';
}

export interface TerraformDoneEvent {
  runId: string;
  workspaceId: string;
  status: 'SUCCESS' | 'FAILED';
  planSummary: TerraformPlanSummary | null;
}

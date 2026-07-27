export interface DriftCheck {
  name: string;
  expected: string;
  actual: string;
  drift: boolean;
}

export interface DriftReport {
  serverId: string;
  serverName: string;
  checkedAt: string;
  checks: DriftCheck[];
  hasDrift: boolean;
}

export interface AnsiblePlaybookDto {
  id: string;
  name: string;
  description: string | null;
  content: string;
  targetTags: string[];
  variables: Record<string, string> | null;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnsibleJobDto {
  id: string;
  playbookId: string;
  playbookName: string;
  serverIds: string[];
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  output: string | null;
  driftReport: DriftReport[] | null;
  triggeredBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CreateAnsiblePlaybookDto {
  name: string;
  description?: string;
  content: string;
  targetTags?: string[];
  variables?: Record<string, string>;
}

export interface RunAnsiblePlaybookDto {
  serverIds: string[];
  variables?: Record<string, string>;
}

export interface AnsibleLogEvent {
  jobId: string;
  playbookId: string;
  line: string;
  stream: 'stdout' | 'stderr';
}

export interface AnsibleDoneEvent {
  jobId: string;
  playbookId: string;
  status: 'SUCCESS' | 'FAILED';
  driftReport: DriftReport[] | null;
}

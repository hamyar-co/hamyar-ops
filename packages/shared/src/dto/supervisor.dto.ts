export interface SupervisorRuleDto {
  id: string;
  serverId: string | null;
  serverName?: string | null;
  appName: string;
  appType: 'PM2' | 'DOCKER' | 'SYSTEMD';
  autoRestart: boolean;
  enabled: boolean;
  lastCheckAt: string | null;
  lastStatus: 'RUNNING' | 'DOWN' | 'RESTARTED' | 'UNKNOWN' | null;
  restartCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupervisorRuleDto {
  serverId?: string;
  appName: string;
  appType: 'PM2' | 'DOCKER' | 'SYSTEMD';
  autoRestart?: boolean;
  enabled?: boolean;
}

export interface UpdateSupervisorRuleDto {
  appName?: string;
  appType?: 'PM2' | 'DOCKER' | 'SYSTEMD';
  autoRestart?: boolean;
  enabled?: boolean;
}

export interface SupervisorCheckResultDto {
  ruleId: string;
  appName: string;
  serverId: string | null;
  status: 'RUNNING' | 'DOWN' | 'RESTARTED' | 'UNKNOWN';
  restarted: boolean;
  checkedAt: string;
}

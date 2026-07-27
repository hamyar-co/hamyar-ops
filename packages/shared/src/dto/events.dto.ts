export interface EventDto {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  serverId: string | null;
  serverName: string | null;
  appName: string | null;
  userId: string | null;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  createdAt: string;
}

export interface CreateEventDto {
  type: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  serverId?: string;
  serverName?: string;
  appName?: string;
  userId?: string;
  severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
}

export interface EventFiltersDto {
  type?: string;
  serverId?: string;
  appName?: string;
  userId?: string;
  severity?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedEventsDto {
  items: EventDto[];
  total: number;
  page: number;
  limit: number;
}

export const EVENT_TYPES = {
  TERMINAL_CMD: 'TERMINAL_CMD',
  DEPLOY: 'DEPLOY',
  CRON_RUN: 'CRON_RUN',
  FILE_OP: 'FILE_OP',
  SERVER_CMD: 'SERVER_CMD',
  APP_EVENT: 'APP_EVENT',
  SUPERVISOR: 'SUPERVISOR',
  GITHUB_DEPLOY: 'GITHUB_DEPLOY',
  FIREWALL: 'FIREWALL',
  SSH_ACCESS: 'SSH_ACCESS',
  SERVER_CONFIG: 'SERVER_CONFIG',
  SYSTEM: 'SYSTEM',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

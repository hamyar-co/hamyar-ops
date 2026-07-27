export type RegistryType = 'dockerhub' | 'ghcr' | 'self-hosted';
export type BuildMode = 'ci' | 'local' | 'remote';

export interface ContainerRegistryDto {
  id: string;
  name: string;
  type: RegistryType;
  url: string | null;
  username: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryImageDto {
  name: string;
  tag: string;
  digest?: string;
  sizeBytes?: number;
  pushedAt?: string | null;
}

export interface BuildRequestDto {
  appName: string;
  mode: BuildMode;
  registryId?: string;
  serverId?: string;
  tag?: string;
  dockerfilePath?: string;
  contextPath?: string;
}

export interface BuildRecordDto {
  id: string;
  appName: string;
  mode: BuildMode;
  registryId: string | null;
  serverId: string | null;
  tag: string | null;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  output: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CreateRegistryDto {
  name: string;
  type: RegistryType;
  url?: string;
  username?: string;
  password?: string;
}

export interface BuildLogEvent {
  buildId: string;
  appName: string;
  line: string;
  stream: 'stdout' | 'stderr';
}

export interface BuildDoneEvent {
  buildId: string;
  appName: string;
  status: 'SUCCESS' | 'FAILED';
  tag: string | null;
}

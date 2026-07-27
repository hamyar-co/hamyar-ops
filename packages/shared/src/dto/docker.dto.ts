export interface ContainerDto {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'created' | 'paused' | 'restarting' | 'dead' | 'removing';
  ports: PortBinding[];
  created: number;
  labels: Record<string, string>;
  networkMode: string;
  mounts: MountDto[];
}

export interface PortBinding {
  containerPort: number;
  hostPort: number | null;
  protocol: string;
}

export interface MountDto {
  type: string;
  source: string;
  destination: string;
  mode: string;
}

export interface ContainerStatsDto {
  id: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

export interface ImageDto {
  id: string;
  tags: string[];
  size: number;
  created: number;
  digest: string;
}

export interface NetworkDto {
  id: string;
  name: string;
  driver: string;
  scope: string;
  ipam: { subnet: string; gateway: string }[];
  containers: Record<string, { name: string; ipv4Address: string }>;
}

export interface VolumeDto {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt: string;
  labels: Record<string, string>;
  scope: string;
}

export interface PullImageDto {
  image: string;
}

export interface ComposeUpDto {
  services?: string[];
}

export interface ComposeRunDto {
  name: string;
  content: string;
  services?: string[];
  up?: boolean;
}

export interface DatabaseDumpDto {
  containerId: string;
  engine: 'postgres' | 'mysql';
  database: string;
  username?: string;
  password?: string;
}

export interface DatabaseInfoDto {
  containerId: string;
  containerName: string;
  engine: 'postgres' | 'mysql';
  databases: string[];
}

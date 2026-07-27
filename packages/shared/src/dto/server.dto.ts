export interface ServerMetricsDto {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics[];
  network: NetworkMetrics;
  timestamp: number;
}

export interface CpuMetrics {
  percent: number;
  cores: number;
  model: string;
  speed: number;
  usage?: CpuUsageDetail;
}

export interface CpuUsageDetail {
  user: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
  steal: number;
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  percent: number;
  usage?: MemoryUsageDetail;
}

export interface MemoryUsageDetail {
  available: number;
  buffers: number;
  cached: number;
  swapTotal: number;
  swapUsed: number;
  swapFree: number;
  swapPercent: number;
}

export interface DiskMetrics {
  filesystem: string;
  size: number;
  used: number;
  available: number;
  percent: number;
  mount: string;
  type?: string;
}

export interface NetworkMetrics {
  rx: number;
  tx: number;
  rxSec: number;
  txSec: number;
  interface: string;
  usage?: NetworkUsageDetail;
  interfaces?: NetworkInterfaceDetail[];
}

export interface NetworkUsageDetail {
  totalRx: number;
  totalTx: number;
  packetsRx?: number;
  packetsTx?: number;
  errorsRx?: number;
  errorsTx?: number;
  dropsRx?: number;
  dropsTx?: number;
}

export interface NetworkInterfaceDetail {
  name: string;
  ip4: string;
  ip6: string;
  mac: string;
  type: string;
  speed: number;
  duplex: string;
  operstate: string;
  rxBytes: number;
  txBytes: number;
  rxPackets?: number;
  txPackets?: number;
  rxErrors?: number;
  txErrors?: number;
}

export interface ProcessInfoDto {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  status: string;
  started: string;
  command: string;
  user: string;
}

export interface SystemServiceDto {
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'disabled' | 'unknown';
  enabled: boolean;
  description?: string;
}

export interface MetricHistoryDto {
  timestamp: number;
  value: number;
}

export interface ManagedServerDto {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  sshKeyId: string | null;
  sshKeyName: string | null;
  tags: string[];
  isActive: boolean;
  lastPingAt: string | null;
  lastPingOk: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateManagedServerDto {
  name: string;
  host: string;
  port?: number;
  username: string;
  sshKeyId?: string;
  tags?: string[];
}

export interface UpdateManagedServerDto {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  sshKeyId?: string;
  tags?: string[];
  isActive?: boolean;
}

export interface SshKeyDto {
  id: string;
  name: string;
  publicKey: string | null;
  hasPassphrase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSshKeyDto {
  name: string;
  privateKey: string;
  publicKey?: string;
  passphrase?: string;
}

export interface RemoteMetricsDto {
  serverId: string;
  serverName: string;
  reachable: boolean;
  error?: string;
  metrics?: ServerMetricsDto;
}

export interface RemoteCommandResult {
  serverId: string;
  serverName: string;
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

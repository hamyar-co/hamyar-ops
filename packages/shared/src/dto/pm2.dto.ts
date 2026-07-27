export interface PM2ProcessDto {
  id: number;
  name: string;
  status: 'online' | 'stopped' | 'errored' | 'launching' | 'stopping' | 'waiting restart';
  pid: number | null;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
  script: string;
  cwd: string;
  mode: 'fork' | 'cluster';
  instances: number;
  pm2Id: number;
  namespace: string;
  version: string;
  env: Record<string, string>;
  logOutPath: string;
  logErrPath: string;
  maxMemoryRestart: string | null;
}

export interface CreatePM2ProcessDto {
  name: string;
  script: string;
  cwd: string;
  args?: string;
  interpreter?: string;
  instances?: number;
  execMode?: 'fork' | 'cluster';
  env?: Record<string, string>;
  maxMemoryRestart?: string;
  errorFile?: string;
  outFile?: string;
}

export interface UpdatePM2ProcessDto {
  env?: Record<string, string>;
  maxMemoryRestart?: string;
  instances?: number;
}

export interface PM2LogLineDto {
  name: string;
  data: string;
  level: 'out' | 'err';
  timestamp: number;
}

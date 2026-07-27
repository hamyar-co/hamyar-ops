export interface OpenPortDto {
  port: number;
  protocol: 'tcp' | 'udp' | 'tcp6' | 'udp6';
  state: string;
  bindAddress: string;
  processName: string;
  pid: number | null;
  exposed: boolean;
  service: string | null;
  ufwAction: 'ALLOW' | 'DENY' | 'FWD' | null;
}

export interface UfwRuleDto {
  action: 'ALLOW' | 'DENY' | 'FWD';
  direction: 'IN' | 'OUT';
  port: number | null;
  protocol: string | null;
  from: string | null;
  to: string | null;
}

export interface UfwStatusDto {
  installed: boolean;
  enabled: boolean;
  loaded: boolean;
  rules: UfwRuleDto[];
}

export interface PortPolicyDto {
  port: number;
  protocol: string;
  action: 'ALLOW' | 'DENY' | 'RESTRICT_LOCALHOST';
  safe: boolean;
  reason: string;
}

export interface ServerPortsDto {
  ports: OpenPortDto[];
  ufwStatus: UfwStatusDto;
  pipeline: PortPolicyDto[];
}

export interface DisableExternalAccessDto {
  success: boolean;
  message: string;
  restrictedPorts: number[];
  protectedPorts: number[];
}

export interface EnableExternalAccessDto {
  success: boolean;
  message: string;
}
export interface NginxConfigDto {
  name: string;
  path: string;
  content: string;
  enabled: boolean;
  size: number;
  modifiedAt: string;
}

export interface NginxStatusDto {
  running: boolean;
  version: string;
  configTest: 'ok' | 'error';
  configTestOutput: string;
  activeSites: string[];
  availableSites: string[];
}

export interface NginxSslCertDto {
  domain: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  path: string;
}

export interface UpdateNginxConfigDto {
  content: string;
}

export interface ValidateNginxDto {
  content: string;
}

export interface ValidateNginxResultDto {
  valid: boolean;
  output: string;
}

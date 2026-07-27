export interface MicroserviceProjectDto {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  services?: MicroserviceDto[];
}

export interface MicroserviceDto {
  id: string;
  projectId: string;
  name: string;
  pm2Prefix: string;
  deployPath: string | null;
  startCmd: string | null;
  basePort: number;
  targetInstances: number;
  healthUrl: string | null;
  routePrefix: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMicroserviceProjectDto {
  name: string;
  domain?: string;
  description?: string;
}

export interface CreateMicroserviceDto {
  projectId: string;
  name: string;
  pm2Prefix: string;
  deployPath?: string;
  startCmd?: string;
  basePort: number;
  targetInstances?: number;
  healthUrl?: string;
  routePrefix?: string;
}

export interface UpdateMicroserviceDto {
  name?: string;
  deployPath?: string;
  startCmd?: string;
  basePort?: number;
  targetInstances?: number;
  healthUrl?: string;
  routePrefix?: string;
}

export interface LoadBalancerStatusDto {
  config: string;
  isApplied: boolean;
  isEnabled: boolean;
  isValid: boolean;
  validationOutput?: string;
}

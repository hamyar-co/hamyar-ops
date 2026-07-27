export interface UserSshKeyDto {
  id: string;
  userId: string;
  name: string;
  fingerprint: string;
  publicKey: string;
  createdAt: string;
}

export interface CreateUserSshKeyDto {
  name: string;
  publicKey: string;
}

export interface PushKeyResultDto {
  keyId: string;
  serverId: string;
  success: boolean;
  message: string;
}

export interface PasswordAuthDto {
  serverId: string;
  enabled: boolean;
}

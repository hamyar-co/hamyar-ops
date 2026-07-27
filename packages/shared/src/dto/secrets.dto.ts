export type SecretBackend = 'env' | 'vault-ansible' | 'vault-hcp';

export interface SecretEntryDto {
  key: string;
  value?: string;       // omitted when masked
  masked: boolean;
  backend: SecretBackend;
  scope: string;        // appName for env secrets, path for vault
  updatedAt?: string;
}

export interface AnsibleVaultStatusDto {
  configured: boolean;
  hasPassword: boolean;
}

export interface HcpVaultStatusDto {
  configured: boolean;
  reachable: boolean;
  url: string | null;
}

export interface VaultStatusDto {
  ansible: AnsibleVaultStatusDto;
  hcp: HcpVaultStatusDto;
}

export interface EncryptAnsibleVarDto {
  key: string;
  value: string;
  password: string;
}

export interface EncryptedVarDto {
  key: string;
  encrypted: string;
}

export interface SetEnvSecretDto {
  appName: string;
  key: string;
  value: string;
}

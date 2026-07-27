export interface HostnameDto {
  serverId: string;
  hostname: string;
}

export interface HostsEntryDto {
  lineNum: number;
  ip: string;
  hostname: string;
  aliases: string[];
  comment?: string;
  raw: string;
}

export interface HostsFileDto {
  serverId: string;
  entries: HostsEntryDto[];
  raw: string;
}

export interface ResolvConfDto {
  serverId: string;
  nameservers: string[];
  search: string[];
  raw: string;
}

export interface SetHostnameDto {
  hostname: string;
}

export interface UpdateHostsFileDto {
  content: string;
}

export interface AddHostsEntryDto {
  ip: string;
  hostname: string;
  aliases?: string[];
  comment?: string;
}

export interface SetNameserversDto {
  nameservers: string[];
  search?: string[];
}

export interface PasswordAuthStatusDto {
  serverId: string;
  enabled: boolean;
  rawLine: string;
}

export interface ServerFirewallStatusDto {
  serverId: string;
  enabled: boolean;
  defaultIncoming: string;
  defaultOutgoing: string;
}

export interface ServerFirewallRuleDto {
  ruleNum: number;
  action: 'ALLOW' | 'DENY' | 'LIMIT';
  direction: 'IN' | 'OUT' | 'FWD';
  from: string;
  to: string;
  protocol: string;
}

export interface CreateServerFirewallRuleDto {
  serverId: string;
  port: string;
  protocol?: 'tcp' | 'udp' | 'any';
  action: 'allow' | 'deny';
  fromIp?: string;
  direction?: 'in' | 'out';
  comment?: string;
}

export interface DeleteServerFirewallRuleDto {
  serverId: string;
  ruleNum: number;
}

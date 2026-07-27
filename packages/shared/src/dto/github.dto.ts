export interface GithubConnectionDto {
  connected: boolean;
  githubLogin?: string;
  avatarUrl?: string;
  githubUserId?: string;
  createdAt?: string;
}

export interface GithubRepoDto {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  updatedAt: string;
}

export interface GithubBranchDto {
  name: string;
  commit: string;
  protected: boolean;
}

export interface GithubDeployDto {
  repoFullName: string;
  branch: string;
  serverId: string;
  deployPath: string;
  appName: string;
  buildCmd?: string;
  startCmd?: string;
  envVars?: Record<string, string>;
}

export interface GithubDeployRunDto {
  id: string;
  repoFullName: string;
  branch: string;
  serverId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt?: string;
}

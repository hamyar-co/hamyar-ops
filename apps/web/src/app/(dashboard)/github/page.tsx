'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import type { GithubConnectionDto, GithubRepoDto, GithubBranchDto } from '@hamyar-ops/shared';

interface ManagedServer { id: string; name: string; host: string }
interface EventItem { id: string; title: string; metadata: any; severity: string; createdAt: string }

export default function GithubPage() {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const [selectedRepo, setSelectedRepo] = useState<GithubRepoDto | null>(null);
  const [deployBranch, setDeployBranch] = useState('main');
  const [deployServerId, setDeployServerId] = useState('');
  const [deployPath, setDeployPath] = useState('');
  const [deployAppName, setDeployAppName] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployDone, setDeployDone] = useState<{ status: string } | null>(null);
  const [activeDeployId, setActiveDeployId] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [connectedBanner, setConnectedBanner] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Check for ?connected=true in URL (after OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      setConnectedBanner(true);
      window.history.replaceState({}, '', '/github');
      setTimeout(() => setConnectedBanner(false), 5000);
    }
  }, []);

  // WebSocket deploy log streaming
  useEffect(() => {
    if (!socket || !activeDeployId) return;
    const onLog = (data: { deployId: string; line: string }) => {
      if (data.deployId !== activeDeployId) return;
      setDeployLogs(prev => [...prev, data.line]);
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
    };
    const onDone = (data: { deployId: string; status: string }) => {
      if (data.deployId !== activeDeployId) return;
      setDeployDone(data);
      setDeploying(false);
      qc.invalidateQueries({ queryKey: ['github-events'] });
    };
    socket.on('github:deploy:log', onLog);
    socket.on('github:deploy:done', onDone);
    return () => { socket.off('github:deploy:log', onLog); socket.off('github:deploy:done', onDone); };
  }, [socket, activeDeployId, qc]);

  const { data: config } = useQuery<{ configured: boolean }>({
    queryKey: ['github-config'],
    queryFn: () => apiClient.get('/github/config').then(r => r.data),
  });

  const { data: connection, isLoading: connLoading } = useQuery<GithubConnectionDto>({
    queryKey: ['github-connection'],
    queryFn: () => apiClient.get('/github/status').then(r => r.data),
  });

  const { data: repos = [], isLoading: reposLoading } = useQuery<GithubRepoDto[]>({
    queryKey: ['github-repos'],
    queryFn: () => apiClient.get('/github/repos').then(r => r.data),
    enabled: connection?.connected === true,
  });

  const { data: branches = [] } = useQuery<GithubBranchDto[]>({
    queryKey: ['github-branches', selectedRepo?.fullName],
    queryFn: () => {
      if (!selectedRepo) return [];
      const [owner, repo] = selectedRepo.fullName.split('/');
      return apiClient.get(`/github/repos/${owner}/${repo}/branches`).then(r => r.data);
    },
    enabled: !!selectedRepo,
  });

  const { data: servers = [] } = useQuery<ManagedServer[]>({
    queryKey: ['managed-servers'],
    queryFn: () => apiClient.get('/servers').then(r => r.data),
  });

  const { data: recentDeploys = [] } = useQuery<EventItem[]>({
    queryKey: ['github-events'],
    queryFn: () => apiClient.get('/events?type=GITHUB_DEPLOY&limit=10').then(r => r.data?.items ?? []),
    enabled: connection?.connected === true,
    refetchInterval: 30000,
  });

  const authMutation = useMutation({
    mutationFn: () => apiClient.get('/github/auth').then(r => r.data),
    onSuccess: (data: { authUrl: string; configured: boolean }) => {
      if (!data.configured || !data.authUrl) return;
      window.location.href = data.authUrl;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.delete('/github/disconnect'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['github-connection'] });
      qc.invalidateQueries({ queryKey: ['github-repos'] });
      setSelectedRepo(null);
    },
  });

  const deployMutation = useMutation({
    mutationFn: (dto: any) => apiClient.post('/github/deploy', dto).then(r => r.data),
    onSuccess: (data: { deployId: string }) => {
      setActiveDeployId(data.deployId);
      setDeployLogs([]);
      setDeployDone(null);
    },
  });

  const handleDeploy = () => {
    if (!selectedRepo || !deployServerId || !deployPath || !deployAppName) return;
    setDeploying(true);
    setDeployLogs([]);
    setDeployDone(null);
    deployMutation.mutate({
      repoFullName: selectedRepo.fullName,
      branch: deployBranch,
      serverId: deployServerId,
      deployPath,
      appName: deployAppName,
    });
  };

  const filteredRepos = repos.filter(r =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(repoSearch.toLowerCase())
  );

  if (connLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 p-6">
      {/* Connected banner */}
      {connectedBanner && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 px-4 py-3 text-sm font-medium">
          GitHub connected successfully!
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">GitHub Deployment</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect your GitHub account to deploy repos directly to your servers</p>
        </div>
      </div>

      {/* Connection card */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">GitHub Connection</h2>
        {config && !config.configured ? (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-4">
            <div className="flex items-start gap-3">
              <span className="text-yellow-500 text-lg mt-0.5">⚠</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground mb-1">GitHub OAuth not configured</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Add the following variables to your <code className="font-mono bg-surface-2 px-1 rounded">/opt/hamyar/ops/api/.env</code> file, then restart the API.
                </p>
                <pre className="text-xs font-mono bg-black/80 text-green-400 rounded-lg p-3 overflow-x-auto select-all">
{`GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=https://ops.hamyar.app/api/github/callback
FRONTEND_URL=https://ops.hamyar.app`}
                </pre>
                <p className="text-xs text-muted-foreground mt-3">
                  Create a GitHub OAuth App at{' '}
                  <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer" className="text-primary underline">
                    github.com/settings/developers
                  </a>
                  {' '}→ <strong>New OAuth App</strong>. Set the callback URL to the value above.
                </p>
              </div>
            </div>
          </div>
        ) : connection?.connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connection.avatarUrl && (
                <img src={connection.avatarUrl} alt="GitHub avatar" className="w-10 h-10 rounded-full border border-border" />
              )}
              <div>
                <div className="font-medium text-foreground">{connection.githubLogin}</div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
                  Connected
                </span>
              </div>
            </div>
            <button
              onClick={() => { if (confirm('Disconnect GitHub?')) disconnectMutation.mutate(); }}
              className="px-3 py-1.5 text-xs rounded border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">🐙</div>
            <p className="text-muted-foreground text-sm mb-4">Connect your GitHub account to browse repositories and deploy them to your servers.</p>
            <button
              onClick={() => authMutation.mutate()}
              disabled={authMutation.isPending}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {authMutation.isPending ? 'Redirecting...' : 'Connect with GitHub'}
            </button>
          </div>
        )}

      </div>

      {/* Repos + Deploy panel — only when connected */}
      {connection?.connected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Repos list */}
          <div className="bg-surface border border-border rounded-lg flex flex-col">
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground mb-3">Repositories</h2>
              <input
                type="text"
                value={repoSearch}
                onChange={e => setRepoSearch(e.target.value)}
                placeholder="Search repos..."
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border" style={{ maxHeight: '500px' }}>
              {reposLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading repositories...</div>
              ) : filteredRepos.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No repositories found</div>
              ) : (
                filteredRepos.map(repo => (
                  <button
                    key={repo.id}
                    onClick={() => { setSelectedRepo(repo); setDeployBranch(repo.defaultBranch); setDeployAppName(repo.name); setDeployPath(`/opt/${repo.name}`); }}
                    className={`w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors ${selectedRepo?.id === repo.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{repo.name}</span>
                      {repo.private && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">Private</span>}
                      {repo.fork && <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground border border-border">Fork</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{repo.owner} · {repo.defaultBranch}</div>
                    {repo.description && <div className="text-xs text-muted-foreground mt-1 truncate">{repo.description}</div>}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: Deploy panel */}
          <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-foreground">
              {selectedRepo ? `Deploy: ${selectedRepo.fullName}` : 'Select a repository to deploy'}
            </h2>

            {selectedRepo ? (
              <>
                {/* Branch */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Branch</label>
                  <select
                    value={deployBranch}
                    onChange={e => setDeployBranch(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {branches.length > 0
                      ? branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)
                      : <option value={selectedRepo.defaultBranch}>{selectedRepo.defaultBranch}</option>
                    }
                  </select>
                </div>

                {/* Target server */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Target Server</label>
                  <select
                    value={deployServerId}
                    onChange={e => setDeployServerId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select a server...</option>
                    <option value="self">Current Server (Ops)</option>
                    {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
                  </select>
                </div>

                {/* Deploy path */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Deploy Path</label>
                  <input
                    type="text"
                    value={deployPath}
                    onChange={e => setDeployPath(e.target.value)}
                    placeholder="/opt/my-app"
                    className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>

                {/* PM2 app name */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">PM2 App Name</label>
                  <input
                    type="text"
                    value={deployAppName}
                    onChange={e => setDeployAppName(e.target.value)}
                    placeholder="my-app"
                    className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>

                {/* Deploy button */}
                <button
                  onClick={handleDeploy}
                  disabled={deploying || !deployServerId || !deployPath || !deployAppName}
                  className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deploying ? (
                    <><span className="animate-spin">⟳</span> Deploying...</>
                  ) : (
                    <><span>▶</span> Deploy</>
                  )}
                </button>

                {/* Live log output */}
                {(deployLogs.length > 0 || deploying) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Deploy Output</span>
                      {deployDone && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${deployDone.status === 'SUCCESS' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-500'}`}>
                          {deployDone.status}
                        </span>
                      )}
                    </div>
                    <div
                      ref={logRef}
                      className="bg-black/90 rounded-lg p-3 font-mono text-xs text-green-400 overflow-y-auto"
                      style={{ maxHeight: '250px', minHeight: '100px' }}
                    >
                      {deployLogs.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                      {deploying && <div className="animate-pulse">▊</div>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-12">
                ← Select a repository from the list
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent deploys */}
      {connection?.connected && recentDeploys.length > 0 && (
        <div className="bg-surface border border-border rounded-lg">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Recent GitHub Deploys</h2>
          </div>
          <div className="divide-y divide-border">
            {recentDeploys.map(ev => {
              const meta = ev.metadata as any ?? {};
              const isSuccess = ev.severity === 'SUCCESS';
              return (
                <div key={ev.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{meta.repoFullName ?? ev.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Branch: {meta.branch ?? '?'} · Server: {meta.serverName ?? '?'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${isSuccess ? 'bg-green-500/10 text-green-600 dark:text-green-400' : ev.severity === 'ERROR' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-600'}`}>
                      {ev.severity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

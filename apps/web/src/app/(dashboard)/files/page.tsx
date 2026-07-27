'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomBadge } from '@/components/ui/CustomBadge';
import { CustomModal } from '@/components/ui/CustomModal';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const ROOTS = [
  { label: '/etc/nginx', path: '/etc/nginx' },
  { label: '/opt/hamyar', path: '/opt/hamyar' },
  { label: '/var/log/hamyar', path: '/var/log/hamyar' },
  { label: '/var/www', path: '/var/www' },
];

export default function FilesPage() {
  const [path, setPath] = useState('/etc/nginx');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [serverId, setServerId] = useState<string>('self');

  const serverParam = serverId !== 'self' ? `&serverId=${encodeURIComponent(serverId)}` : '';

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ['files', path, serverId],
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/files?path=${encodeURIComponent(path)}${serverParam}`);
        return res.data;
      } catch {
        return [
          { name: 'nginx.conf', path: `${path}/nginx.conf`, type: 'file', size: 1420, updatedAt: new Date().toISOString() },
          { name: 'conf.d', path: `${path}/conf.d`, type: 'directory', size: 0, updatedAt: new Date().toISOString() },
          { name: 'sites-available', path: `${path}/sites-available`, type: 'directory', size: 0, updatedAt: new Date().toISOString() },
          { name: 'sites-enabled', path: `${path}/sites-enabled`, type: 'directory', size: 0, updatedAt: new Date().toISOString() },
        ];
      }
    },
  });

  const { data: fileContent, isLoading: loadingFile } = useQuery({
    queryKey: ['file-content', selectedFile, serverId],
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/files/content?path=${encodeURIComponent(selectedFile!)}${serverParam}`);
        return res.data;
      } catch {
        return `# Configuration file\n# Path: ${selectedFile}\nserver {\n    listen 80;\n    server_name example.com;\n}`;
      }
    },
    enabled: !!selectedFile,
  });

  useEffect(() => {
    if (typeof fileContent === 'string') setEditContent(fileContent);
  }, [fileContent]);

  const saveFile = useMutation({
    mutationFn: () => apiClient.post('/files/write', {
      path: selectedFile,
      content: editContent,
      ...(serverId !== 'self' && { serverId }),
    }),
  });

  const filteredEntries = entries.filter((e) =>
    e.name.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  const getFileLanguage = (name: string) => {
    if (name.endsWith('.js') || name.endsWith('.mjs')) return 'javascript';
    if (name.endsWith('.ts')) return 'typescript';
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.conf') || name.endsWith('.nginx')) return 'nginx';
    if (name.endsWith('.sh')) return 'shell';
    if (name.endsWith('.env')) return 'ini';
    return 'plaintext';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">File Explorer & Editor</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Browse server file system directories, search configuration files, and edit code with syntax highlighting.
          </p>
        </div>
      </div>

      {/* Directory Shortcuts & Search Bar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        {/* Quick Directory Presets */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-hide">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Presets:</span>
          {ROOTS.map((r) => (
            <button
              key={r.path}
              onClick={() => { setPath(r.path); setSelectedFile(null); }}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all shrink-0 ${
                path === r.path
                  ? 'bg-primary/10 text-primary border-primary/30 font-semibold'
                  : 'bg-surface-2 border-border text-foreground hover:bg-surface'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Instant Search Bar */}
        <div className="w-full md:w-80">
          <CustomInput
            placeholder="🔍 Search files in current folder..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Breadcrumb Path Bar */}
      <div className="bg-surface border border-border px-4 py-2.5 rounded-lg flex items-center gap-2 font-mono text-xs text-foreground overflow-x-auto">
        <span className="text-muted-foreground">Path:</span>
        <span className="font-bold text-primary">{path}</span>
      </div>

      {/* Main Grid: File List & Code Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[500px]">
        {/* File Browser Panel */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Folder Contents</span>
            <CustomBadge variant="outline">{filteredEntries.length} items</CustomBadge>
          </div>

          <div className="divide-y divide-border overflow-y-auto flex-1 max-h-[520px]">
            {isLoading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading files...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No files match '{searchFilter}'</div>
            ) : (
              filteredEntries.map((e) => (
                <button
                  key={e.path}
                  onClick={() => {
                    if (e.type === 'directory') setPath(e.path);
                    else setSelectedFile(e.path);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    selectedFile === e.path ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-surface-2 text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">{e.type === 'directory' ? '📁' : '📄'}</span>
                    <span className="text-xs font-mono truncate">{e.name}</span>
                  </div>
                  {e.type === 'file' && (
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{e.size} B</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Code Editor Panel */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          {selectedFile ? (
            <>
              <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-foreground font-semibold truncate">{selectedFile}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <CustomButton
                    size="sm"
                    loading={saveFile.isPending}
                    onClick={() => saveFile.mutate()}
                  >
                    Save Changes
                  </CustomButton>
                </div>
              </div>

              <div className="flex-1 min-h-[460px] bg-[#1e1e1e]">
                {loadingFile ? (
                  <div className="p-8 text-center text-xs text-white/50">Loading file content...</div>
                ) : (
                  <MonacoEditor
                    height="100%"
                    language={getFileLanguage(selectedFile)}
                    theme="vs-dark"
                    value={editContent}
                    onChange={(v) => setEditContent(v ?? '')}
                    options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <span className="text-4xl mb-2">📝</span>
              <p className="text-sm font-semibold">No File Selected</p>
              <p className="text-xs mt-1">Select a configuration or code file from the left panel to inspect and edit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

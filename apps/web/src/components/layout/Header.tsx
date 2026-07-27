'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore } from '@/stores/theme.store';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useSocket } from '@/hooks/useSocket';
import { useSidebarStore } from '@/stores/sidebar.store';

export function Header() {
  const { user, clearAuth } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { connected } = useSocket();
  const router = useRouter();
  const { toggleMobile } = useSidebarStore();

  const handleLogout = async () => {
    try { await apiClient.post('/auth/logout'); } catch {}
    clearAuth();
    disconnectSocket();
    router.push('/login');
  };

  return (
    <header className="h-14 border-b border-border bg-surface flex items-center px-3 md:px-6 gap-3 shrink-0">
      {/* Mobile: hamburger + app title */}
      <div className="flex items-center gap-2 md:hidden">
        <button
          onClick={toggleMobile}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
          title="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {/* App title — visible only on mobile since the sidebar shows it on desktop */}
        <span className="text-sm font-semibold text-foreground">Hamyar Ops</span>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 border border-border transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Connection indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-error'}`}
          />
          <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
        </div>

        <div className="w-px h-4 bg-border hidden sm:block" />

        {/* User menu */}
        <button
          onClick={handleLogout}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-surface-2"
          title="Sign out"
        >
          <span className="hidden sm:inline">{user?.username} · </span>Sign out
        </button>
      </div>
    </header>
  );
}
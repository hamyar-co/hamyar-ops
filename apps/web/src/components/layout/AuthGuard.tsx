'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Only redirect after Zustand has finished reading from localStorage.
    // Without this guard, the store starts as null on every render (SSR /
    // initial client paint) and immediately sends the user to /login even
    // though they have a valid session stored.
    if (hasHydrated && !user) router.replace('/login');
  }, [user, hasHydrated, router]);

  // Show a full-screen loader while localStorage is being read
  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="animate-spin text-xl">⟳</span>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ServerPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/servers');
  }, [router]);

  return (
    <div className="p-6 text-center text-xs text-muted-foreground">
      Redirecting to Servers & Load Balancer hub...
    </div>
  );
}
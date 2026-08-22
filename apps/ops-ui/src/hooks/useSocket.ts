'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';

export function useSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const s = getSocket(accessToken);
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    if (s.connected) setConnected(true);

    return () => {
      s.off('connect');
      s.off('disconnect');
    };
  }, [accessToken]);

  return { socket, connected };
}

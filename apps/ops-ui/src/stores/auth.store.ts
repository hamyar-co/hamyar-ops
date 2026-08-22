import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserDto } from '@hamyar-ops/shared';

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  /** True once Zustand has read localStorage — prevents redirect-to-login flash on refresh */
  _hasHydrated: boolean;
  setAuth: (token: string, user: UserDto) => void;
  clearAuth: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      _hasHydrated: false,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      clearAuth: () => set({ accessToken: null, user: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'hamyar-ops-auth',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
      onRehydrateStorage: () => (state) => {
        // Called after localStorage is read — mark hydration complete
        state?.setHasHydrated(true);
      },
    },
  ),
);

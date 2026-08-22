import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Build a URL for browser-navigated/anchor downloads that carries the access token
// via query param (the JWT strategy accepts `access_token` in the query).
export function authDownloadUrl(path: string): string {
  const token = useAuthStore.getState().accessToken;
  const sep = path.includes('?') ? '&' : '?';
  return token ? `${path}${sep}access_token=${encodeURIComponent(token)}` : path;
}

let refreshing: Promise<void> | null = null;

// Auth endpoints must never trigger the silent-refresh flow — let their
// errors propagate straight to the caller so the login page can display them.
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];
const isAuthEndpoint = (url?: string) =>
  !!url && AUTH_PATHS.some((p) => url.includes(p));

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Never intercept auth-route 401s — wrong password must reach the login
    // form's catch block, and a failed refresh must not recurse.
    if (isAuthEndpoint(original?.url)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshing) {
        refreshing = apiClient
          .post('/auth/refresh')
          .then((res) => {
            const { accessToken } = res.data;
            useAuthStore.getState().setAuth(accessToken, useAuthStore.getState().user!);
          })
          .catch(() => {
            useAuthStore.getState().clearAuth();
            window.location.href = '/login';
          })
          .finally(() => { refreshing = null; });
      }
      await refreshing;
      const newToken = useAuthStore.getState().accessToken;
      if (newToken) original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    }
    return Promise.reject(error);
  },
);

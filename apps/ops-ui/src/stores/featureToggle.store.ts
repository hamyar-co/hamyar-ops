import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FeatureFlags {
  applications: boolean;
  microservices: boolean;
  env: boolean;
  pm2: boolean;
  docker: boolean;
  nginx: boolean;
  postgres: boolean;
  redis: boolean;
  rabbitmq: boolean;
  servers: boolean;
  terminal: boolean;
  files: boolean;
  firewall: boolean;
  nameserver: boolean;
  sshAccess: boolean;
  terraform: boolean;
  ansible: boolean;
  pipelines: boolean;
  registry: boolean;
  github: boolean;
  cron: boolean;
  supervisor: boolean;
  monitoring: boolean;
  logs: boolean;
  events: boolean;
  loadTesting: boolean;
  status: boolean;
  backups: boolean;
  secrets: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  applications: true,
  microservices: true,
  env: true,
  pm2: true,
  docker: true,
  nginx: true,
  postgres: true,
  redis: true,
  rabbitmq: true,
  servers: true,
  terminal: true,
  files: true,
  firewall: true,
  nameserver: true,
  sshAccess: true,
  terraform: true,
  ansible: true,
  pipelines: true,
  registry: true,
  github: true,
  cron: true,
  supervisor: true,
  monitoring: true,
  logs: true,
  events: true,
  loadTesting: true,
  status: true,
  backups: true,
  secrets: true,
};

interface FeatureToggleState {
  features: FeatureFlags;
  toggleFeature: (key: keyof FeatureFlags) => void;
  setAll: (enabled: boolean) => void;
  resetDefaults: () => void;
}

export const useFeatureToggleStore = create<FeatureToggleState>()(
  persist(
    (set) => ({
      features: DEFAULT_FEATURES,
      toggleFeature: (key) =>
        set((state) => ({
          features: { ...state.features, [key]: !state.features[key] },
        })),
      setAll: (enabled) =>
        set((state) => ({
          features: Object.keys(state.features).reduce((acc, k) => {
            acc[k as keyof FeatureFlags] = enabled;
            return acc;
          }, {} as FeatureFlags),
        })),
      resetDefaults: () => set({ features: DEFAULT_FEATURES }),
    }),
    {
      name: 'hamyar-ops-features',
    },
  ),
);

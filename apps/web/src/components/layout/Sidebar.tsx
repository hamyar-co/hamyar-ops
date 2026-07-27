'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useFeatureToggleStore, FeatureFlags } from '@/stores/featureToggle.store';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  key?: keyof FeatureFlags;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Applications',
    items: [
      { href: '/dashboard',     label: 'Overview',      icon: '⬡' },
      { href: '/applications',  label: 'Applications',  icon: '▣', key: 'applications' },
      { href: '/microservices', label: 'Microservices', icon: '▦', key: 'microservices' },
      { href: '/env',           label: 'Environment',   icon: '⚿', key: 'env' },
      { href: '/pm2',           label: 'PM2',           icon: '⚡', key: 'pm2' },
      { href: '/docker',        label: 'Docker',        icon: '🐳', key: 'docker' },
      { href: '/nginx',         label: 'Nginx',         icon: '🔧', key: 'nginx' },
    ],
  },
  {
    label: 'Databases',
    items: [
      { href: '/postgres',      label: 'PostgreSQL',    icon: '🐘', key: 'postgres' },
      { href: '/redis',         label: 'Redis',         icon: '⚡', key: 'redis' },
      { href: '/rabbitmq',      label: 'RabbitMQ',      icon: '🐇', key: 'rabbitmq' },
    ],
  },
  {
    label: 'Servers & Load Balancer',
    items: [
      { href: '/servers',         label: 'Servers & LB',  icon: '☁', key: 'servers' },
      { href: '/terminal',        label: 'Terminal',      icon: '>', key: 'terminal' },
      { href: '/files',           label: 'Files',         icon: '📁', key: 'files' },
      { href: '/server-firewall', label: 'Firewall',      icon: '🔥', key: 'firewall' },
      { href: '/nameserver',      label: 'Nameserver',    icon: '🌐', key: 'nameserver' },
      { href: '/ssh-access',      label: 'SSH Access',    icon: '🔐', key: 'sshAccess' },
    ],
  },
  {
    label: 'Automation',
    items: [
      { href: '/infrastructure', label: 'Terraform',    icon: '◈', key: 'terraform' },
      { href: '/ansible',        label: 'Ansible',      icon: '⚙', key: 'ansible' },
      { href: '/pipelines',      label: 'Pipelines',    icon: '▶', key: 'pipelines' },
      { href: '/registry',       label: 'Registry',     icon: '◻', key: 'registry' },
      { href: '/github',         label: 'GitHub',       icon: '🐙', key: 'github' },
      { href: '/cron',           label: 'Cron Jobs',    icon: '⏰', key: 'cron' },
      { href: '/supervisor',     label: 'Supervisor',   icon: '🛡', key: 'supervisor' },
    ],
  },
  {
    label: 'Observability',
    items: [
      { href: '/monitoring',    label: 'Monitoring',    icon: '📊', key: 'monitoring' },
      { href: '/logs',          label: 'Logs',          icon: '📄', key: 'logs' },
      { href: '/events',        label: 'Events',        icon: '📋', key: 'events' },
      { href: '/load-testing',  label: 'Load Testing',  icon: '⚡', key: 'loadTesting' },
      { href: '/status',        label: 'Status',        icon: '❤', key: 'status' },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/backups',  label: 'Backups',  icon: '💾', key: 'backups' },
      { href: '/secrets',  label: 'Secrets',  icon: '🔑', key: 'secrets' },
      { href: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

export function Sidebar() {
  const { collapsed, mobileOpen, toggle, closeMobile } = useSidebarStore();
  const { features } = useFeatureToggleStore();
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const isCollapsedView = collapsed && !mobileOpen;

  // Filter items based on user settings toggles
  const filteredGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.key || features[item.key] !== false),
  })).filter((group) => group.items.length > 0);

  const allFilteredItems = filteredGroups.flatMap((g) => g.items);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed md:relative inset-y-0 left-0 z-50 flex flex-col',
          'bg-surface border-r border-border',
          'transition-transform duration-300 ease-in-out',
          'w-[85vw] max-w-[320px]',
          isCollapsedView ? 'md:w-16 md:max-w-none' : 'md:w-60 md:max-w-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Logo row */}
        <div className="flex items-center h-14 px-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-sm font-bold">M</span>
            </div>
            <span
              className={cn(
                'text-sm font-semibold text-foreground whitespace-nowrap overflow-hidden',
                'transition-all duration-200',
                isCollapsedView ? 'md:w-0 md:opacity-0' : 'opacity-100',
              )}
            >
              Hamyar Ops
            </span>
          </div>

          {/* Desktop collapse toggle */}
          <button
            onClick={toggle}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <span className="text-xs">{collapsed ? '→' : '←'}</span>
          </button>

          {/* Mobile close button */}
          <button
            onClick={closeMobile}
            className="md:hidden flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
            title="Close menu"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 overscroll-contain">
          {isCollapsedView ? (
            <ul className="px-1.5 space-y-0.5">
              {allFilteredItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.label}
                    className={cn(
                      'flex items-center justify-center h-9 w-full rounded-lg text-base transition-colors',
                      isActive(item.href)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-2',
                    )}
                  >
                    {item.icon}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-1">
              {filteredGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
                    {group.label}
                  </p>
                  <ul className="px-2 space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={closeMobile}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                            isActive(item.href)
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-surface-2',
                          )}
                        >
                          <span className="text-base shrink-0 w-5 text-center leading-none">
                            {item.icon}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* User section */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-border shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-xs text-primary font-medium">A</span>
              </div>
              <span className="text-xs text-muted-foreground truncate">Admin</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}


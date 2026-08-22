'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useFeatureToggleStore, FeatureFlags } from '@/stores/featureToggle.store';
import { cn } from '@/lib/utils';
import { 
  Hexagon, LayoutGrid, Layers, Variable, Zap, Container, ServerCog, 
  Database, MessageSquare, Cloud, Terminal, FolderTree, Shield, 
  Globe, KeyRound, Blocks, Settings2, PlaySquare, Package, Github, 
  Clock, ShieldCheck, Activity, FileText, ClipboardList, Gauge, 
  HeartPulse, Save, Lock, Settings 
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
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
      { href: '/dashboard',     label: 'Overview',      icon: <Hexagon size={18} /> },
      { href: '/applications',  label: 'Applications',  icon: <LayoutGrid size={18} />, key: 'applications' },
      { href: '/microservices', label: 'Microservices', icon: <Layers size={18} />, key: 'microservices' },
      { href: '/env',           label: 'Environment',   icon: <Variable size={18} />, key: 'env' },
      { href: '/pm2',           label: 'PM2',           icon: <Zap size={18} />, key: 'pm2' },
      { href: '/docker',        label: 'Docker',        icon: <Container size={18} />, key: 'docker' },
      { href: '/nginx',         label: 'Nginx',         icon: <ServerCog size={18} />, key: 'nginx' },
    ],
  },
  {
    label: 'Databases',
    items: [
      { href: '/postgres',      label: 'PostgreSQL',    icon: <Database size={18} />, key: 'postgres' },
      { href: '/redis',         label: 'Redis',         icon: <Zap size={18} />, key: 'redis' },
      { href: '/rabbitmq',      label: 'RabbitMQ',      icon: <MessageSquare size={18} />, key: 'rabbitmq' },
    ],
  },
  {
    label: 'Servers & Load Balancer',
    items: [
      { href: '/servers',         label: 'Servers & LB',  icon: <Cloud size={18} />, key: 'servers' },
      { href: '/terminal',        label: 'Terminal',      icon: <Terminal size={18} />, key: 'terminal' },
      { href: '/files',           label: 'Files',         icon: <FolderTree size={18} />, key: 'files' },
      { href: '/server-firewall', label: 'Firewall',      icon: <Shield size={18} />, key: 'firewall' },
      { href: '/nameserver',      label: 'Nameserver',    icon: <Globe size={18} />, key: 'nameserver' },
      { href: '/ssh-access',      label: 'SSH Access',    icon: <KeyRound size={18} />, key: 'sshAccess' },
    ],
  },
  {
    label: 'Automation',
    items: [
      { href: '/infrastructure', label: 'Terraform',    icon: <Blocks size={18} />, key: 'terraform' },
      { href: '/ansible',        label: 'Ansible',      icon: <Settings2 size={18} />, key: 'ansible' },
      { href: '/pipelines',      label: 'Pipelines',    icon: <PlaySquare size={18} />, key: 'pipelines' },
      { href: '/registry',       label: 'Registry',     icon: <Package size={18} />, key: 'registry' },
      { href: '/github',         label: 'GitHub',       icon: <Github size={18} />, key: 'github' },
      { href: '/cron',           label: 'Cron Jobs',    icon: <Clock size={18} />, key: 'cron' },
      { href: '/supervisor',     label: 'Supervisor',   icon: <ShieldCheck size={18} />, key: 'supervisor' },
    ],
  },
  {
    label: 'Observability',
    items: [
      { href: '/monitoring',    label: 'Monitoring',    icon: <Activity size={18} />, key: 'monitoring' },
      { href: '/logs',          label: 'Logs',          icon: <FileText size={18} />, key: 'logs' },
      { href: '/events',        label: 'Events',        icon: <ClipboardList size={18} />, key: 'events' },
      { href: '/load-testing',  label: 'Load Testing',  icon: <Gauge size={18} />, key: 'loadTesting' },
      { href: '/status',        label: 'Status',        icon: <HeartPulse size={18} />, key: 'status' },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/backups',  label: 'Backups',  icon: <Save size={18} />, key: 'backups' },
      { href: '/secrets',  label: 'Secrets',  icon: <Lock size={18} />, key: 'secrets' },
      { href: '/settings', label: 'Settings', icon: <Settings size={18} /> },
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
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
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


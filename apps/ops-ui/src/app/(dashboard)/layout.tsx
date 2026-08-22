'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { OperationDrawer } from '@/components/layout/OperationDrawer';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 h-full">
          <Header />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-[1600px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
      {/* Global floating operation log — subscribes to event:new from all modules */}
      <OperationDrawer />
    </AuthGuard>
  );
}
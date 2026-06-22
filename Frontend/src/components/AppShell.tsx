import { useState } from 'react';
import type { ReactNode } from 'react';
import Sidebar from '../features/layout/Sidebar';
import Topbar from '../features/layout/Topbar';
import MobileDrawer from '../features/layout/MobileDrawer';

interface Props {
  children: ReactNode;
  title?: string;
}

export default function AppShell({ children, title }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile topbar */}
        <Topbar title={title} onMenuClick={() => setDrawerOpen(true)} />

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

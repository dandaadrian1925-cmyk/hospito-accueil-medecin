import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import OfflineBanner from '../common/OfflineBanner';
import { HOSPITAL_MODULES } from '../../lib/hospitalModules';

const TITLES = [
  ...HOSPITAL_MODULES.map((m) => ({ prefix: `/${m.path}`, label: m.label })),
  { prefix: '/messages', label: 'Communication interne' },
  { prefix: '/notifications', label: 'Notifications' },
  { prefix: '/audit', label: "Journal d'audit" },
  { prefix: '/profil', label: 'Profil' },
];

function titleFor(pathname) {
  if (pathname === '/') return 'Tableau de bord';
  const match = TITLES.find((t) => pathname.startsWith(t.prefix));
  return match?.label || 'HostoConnect Accueil';
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={titleFor(pathname)} onOpenMobile={() => setMobileOpen(true)} />
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

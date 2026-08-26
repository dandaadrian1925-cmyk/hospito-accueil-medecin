import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import OfflineBanner from '../common/OfflineBanner';

function titleFor(pathname) {
  if (pathname === '/') return 'Mes livraisons';
  if (pathname.startsWith('/commandes')) return 'Détail livraison';
  if (pathname.startsWith('/opportunites')) return 'Opportunités';
  if (pathname.startsWith('/wallet')) return 'Mon wallet';
  if (pathname.startsWith('/gains')) return 'Mes gains';
  if (pathname.startsWith('/tournee')) return 'Ma tournée';
  if (pathname.startsWith('/retours')) return 'Retours à effectuer';
  if (pathname.startsWith('/profil')) return 'Mon profil';
  if (pathname.startsWith('/chat')) return 'Messages';
  if (pathname.startsWith('/notifications')) return 'Notifications';
  if (pathname.startsWith('/verification-cni')) return 'Vérification CNI';
  if (pathname.startsWith('/aide')) return 'Aide';
  return 'MAKET Livreur';
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

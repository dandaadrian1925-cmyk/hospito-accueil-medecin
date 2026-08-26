import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { LayoutDashboard, User, MessageCircle, Bell, Bot, ChevronLeft, X, LogOut, Wallet, Route, Compass, TrendingUp, RotateCcw } from 'lucide-react';
import { auth } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { listenUnreadCount } from '../../services/notificationsService';
import { listenOpportunites, getRolesDisponibles } from '../../services/commandesService';
import ConfirmDialog from '../common/ConfirmDialog';

// #retour utilisateur : le tableau de bord (Mes livraisons) toujours premier,
// Mon profil toujours dernier, tout le reste trié par ordre alphabétique.
const NAV_ITEMS = [
  { to: '/', label: 'Mes livraisons', icon: LayoutDashboard, end: true },
  { to: '/aide', label: 'Aide', icon: Bot },
  { to: '/tournee', label: 'Ma tournée', icon: Route },
  { to: '/gains', label: 'Mes gains', icon: TrendingUp },
  { to: '/chat', label: 'Messages', icon: MessageCircle },
  { to: '/wallet', label: 'Mon wallet', icon: Wallet },
  { to: '/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
  { to: '/opportunites', label: 'Opportunités', icon: Compass, badgeKey: 'opportunites' },
  { to: '/retours', label: 'Retours', icon: RotateCcw },
  { to: '/profil', label: 'Mon profil', icon: User },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { user, userProfile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // #nouveau (demande utilisateur, "un voyant sur la sidebar pour les
  // nouvelles opportunités, pas le nombre") : même filtre EXACT que
  // OpportunitesPage (getRolesDisponibles) — un simple point, jamais de
  // chiffre, contrairement au badge notifications juste au-dessus.
  const [hasOpportunites, setHasOpportunites] = useState(false);
  const estVerifie = userProfile?.cniVerifie && userProfile?.contratSigne;
  const ville = userProfile?.ville;

  useEffect(() => {
    if (!user) return;
    return listenUnreadCount(user.uid, setUnreadCount);
  }, [user]);

  useEffect(() => {
    if (!estVerifie || !ville) { setHasOpportunites(false); return; }
    return listenOpportunites(ville, (commandes) => {
      const visibles = commandes.some((c) => !!getRolesDisponibles(c, ville, user?.uid)[0]);
      setHasOpportunites(visibles);
    });
  }, [estVerifie, ville, user]);

  return (
    <aside
      className={`
        fixed lg:static inset-y-0 left-0 z-50
        flex flex-col bg-sidebar text-sidebar-foreground
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-20' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        {!collapsed && (
          <span className="font-display text-lg font-bold text-sidebar-primary-foreground whitespace-nowrap">
            MAKET <span className="text-sidebar-primary">Livreur</span>
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex ml-auto p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
        >
          <ChevronLeft size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden ml-auto p-1.5">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              ${isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-glow'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }
              ${collapsed ? 'justify-center' : ''}`
            }
          >
            <Icon size={20} className="flex-shrink-0" />
            {!collapsed && <span className="flex-1">{label}</span>}
            {badgeKey === 'notifications' && unreadCount > 0 && (
              <span className={`flex-shrink-0 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center ${collapsed ? 'absolute top-1 right-1 w-2 h-2' : 'min-w-5 h-5 px-1'}`}>
                {!collapsed && (unreadCount > 9 ? '9+' : unreadCount)}
              </span>
            )}
            {badgeKey === 'opportunites' && hasOpportunites && (
              <span className={`flex-shrink-0 bg-sidebar-primary rounded-full ${collapsed ? 'absolute top-1 right-1 w-2 h-2' : 'w-2 h-2'}`} />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4">
        <button
          onClick={() => setConfirmLogout(true)}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium
            text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive transition-all
            ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={20} />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>

      {confirmLogout && (
        <ConfirmDialog
          title="Se déconnecter ?"
          description="Vous devrez vous reconnecter pour accéder à votre compte."
          confirmLabel="Se déconnecter"
          danger
          onConfirm={() => signOut(auth)}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </aside>
  );
}

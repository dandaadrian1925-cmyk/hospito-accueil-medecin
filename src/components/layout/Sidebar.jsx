import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { LayoutDashboard, MessageCircle, Bell, UserCircle, ChevronLeft, X, LogOut } from 'lucide-react';
import { auth } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { HOSPITAL_MODULES } from '../../lib/hospitalModules';
import ConfirmDialog from '../common/ConfirmDialog';

// HOSPITAL_MODULES est une liste partagée (dupliquée dans chaque app) — cette
// app n'a de vraie page que pour admissions/rendez-vous/billets/etc (voir
// App.jsx pour la liste exacte). Exclure ici les entrées dont la vraie page
// existe dans une AUTRE app évite un lien de menu qui mène à un placeholder
// "Module prévu" alors que la fonctionnalité tourne déjà ailleurs.
const MODULES_DANS_UNE_AUTRE_APP = new Set([
  'personnel', // hospito-super-admin
  'patients', 'facturation', // hospito-admin
  'dossiers', 'prescriptions', 'bloc-operatoire', 'laboratoire-imagerie', 'pharmacie', // hospito-medecin
]);

const NAV_ITEMS = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  ...HOSPITAL_MODULES.filter((m) => !MODULES_DANS_UNE_AUTRE_APP.has(m.path)).map((m) => ({ to: `/${m.path}`, label: m.label, icon: m.icon })),
  { to: '/messages', label: 'Communication interne', icon: MessageCircle },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profil', label: 'Profil', icon: UserCircle },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { userProfile } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);

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
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        {!collapsed && (
          <div className="leading-tight overflow-hidden">
            <span className="font-display text-lg font-bold text-sidebar-primary-foreground whitespace-nowrap">
              HostoConnect <span className="text-sidebar-primary">Accueil</span>
            </span>
            {/* #nouveau (demande utilisateur, "le nom du service dont c'est
                l'accueil affiché dans le même design que Accueil") : chaque
                compte accueil gère toujours exactement un service — l'afficher
                ici évite d'avoir à ouvrir le Tableau de bord pour le savoir. */}
            {userProfile?.service && (
              <p className="text-xs font-semibold text-sidebar-primary truncate">{userProfile.service}</p>
            )}
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex ml-auto p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors">
          <ChevronLeft size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden ml-auto p-1.5">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-glow' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
              ${collapsed ? 'justify-center' : ''}`
            }
          >
            <Icon size={20} className="flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

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

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';
import { listenUnreadCount } from '../../services/notificationsService';

function getInitiales(userProfile) {
  const name = userProfile?.displayName || userProfile?.email || 'Accueil';
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return `${parts[0]?.[0] || 'A'}${parts[1]?.[0] || ''}`.toUpperCase();
}

export default function Topbar({ title, onOpenMobile }) {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    return listenUnreadCount(user.uid, setUnreadCount);
  }, [user]);

  return (
    <header className="h-16 flex items-center gap-4 px-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobile}>
        <Menu size={20} />
      </Button>

      <h1 className="font-display text-lg font-bold text-foreground">{title}</h1>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative" onClick={() => navigate('/notifications')}>
          <Bell size={19} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>

        <button onClick={() => navigate('/profil')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground text-sm font-semibold">{getInitiales(userProfile)}</span>
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-foreground">{userProfile?.displayName || userProfile?.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{userProfile?.role}</p>
          </div>
        </button>
      </div>
    </header>
  );
}

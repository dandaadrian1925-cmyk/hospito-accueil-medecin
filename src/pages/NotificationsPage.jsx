import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listenNotifications, marquerNotificationLue, marquerToutesLues, supprimerNotification } from '../services/notificationsService';
import { Button } from '../components/ui/button';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';

function timeAgo(value) {
  const d = value?.toDate ? value.toDate() : new Date(value);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${days}j`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState(null);

  useEffect(() => {
    if (!user) return;
    return listenNotifications(user.uid, setNotifs);
  }, [user]);

  if (notifs === null) return <Loader label="Chargement des notifications…" />;

  const unreadCount = notifs.filter((n) => !n.lu).length;

  const handleClick = async (n) => {
    if (!n.lu) await marquerNotificationLue(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Notifications</h1>
          {unreadCount > 0 && <p className="text-sm text-primary font-semibold mt-1">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</p>}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => marquerToutesLues(notifs)}>
            <Check size={14} /> Tout marquer lu
          </Button>
        )}
      </div>

      {notifs.length === 0 ? (
        <EmptyState title="Aucune notification" icon={Bell} />
      ) : (
        <div className="space-y-2">
          {notifs.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-4 rounded-xl border transition-colors group cursor-pointer ${!n.lu ? 'bg-secondary/60 border-primary/30' : 'bg-card border-border'}`}
              onClick={() => handleClick(n)}
            >
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <Bell size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${!n.lu ? 'text-foreground' : 'text-foreground/80'}`}>{n.titre}</p>
                  {!n.lu && <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); supprimerNotification(n.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

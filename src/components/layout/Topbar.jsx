import { useState } from 'react';
import { Menu } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../firebase/config';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';

function getInitiales(userProfile) {
  const name = userProfile?.displayName || userProfile?.email || 'Admin';
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return `${parts[0]?.[0] || 'A'}${parts[1]?.[0] || ''}`.toUpperCase();
}

export default function Topbar({ title, onOpenMobile }) {
  const { user, userProfile, setUserProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const disponible = userProfile?.disponible !== false; // par défaut disponible tant que le champ n'existe pas

  const toggleDisponible = async () => {
    const next = !disponible;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { disponible: next });
      setUserProfile((p) => ({ ...p, disponible: next }));
      toast.success(next ? 'Vous êtes disponible' : 'Vous êtes indisponible');
    } catch (e) {
      toast.error(e.message || 'Échec de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  return (
    <header className="h-16 flex items-center gap-4 px-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobile}>
        <Menu size={20} />
      </Button>

      <h1 className="font-display text-lg font-bold text-foreground">{title}</h1>

      <div className="flex-1" />

      <button
        onClick={toggleDisponible}
        disabled={saving}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
          disponible ? 'bg-success/10 border-success/30 text-success' : 'bg-muted border-border text-muted-foreground'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${disponible ? 'bg-success' : 'bg-muted-foreground'}`} />
        {disponible ? 'Disponible' : 'Indisponible'}
      </button>

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground text-sm font-semibold">{getInitiales(userProfile)}</span>
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-medium text-foreground">{userProfile?.displayName || userProfile?.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{userProfile?.role}</p>
        </div>
      </div>
    </header>
  );
}

import { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getTransparenceAttente, recalculerTempsAttente } from '../../services/transparenceService';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';

export default function TransparenceAttentePage() {
  const { user, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const [stats, setStats] = useState(undefined);
  const [recalcul, setRecalcul] = useState(false);

  const charger = () => getTransparenceAttente(etablissementId).then(setStats);
  useEffect(() => { charger(); }, [etablissementId]);

  const recalculer = async () => {
    setRecalcul(true);
    try {
      await recalculerTempsAttente(etablissementId, actor);
      toast.success('Temps d\'attente recalculé');
      charger();
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setRecalcul(false);
    }
  };

  if (stats === undefined) return <Loader label="Chargement…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock size={22} className="text-primary" /> Attente & transparence
        </h1>
        <p className="text-muted-foreground mt-1">Temps d'attente moyen en consultation (arrivée au guichet → prise en charge), affiché publiquement aux patients.</p>
      </div>

      <div className="glass-card-elevated p-6 max-w-sm space-y-4">
        {stats?.tempsAttenteMoyenMinutes != null ? (
          <>
            <p className="text-4xl font-bold text-foreground">{stats.tempsAttenteMoyenMinutes} min</p>
            <p className="text-sm text-muted-foreground">
              Calculé sur les {stats.nombreEchantillon} derniers cas pris en charge
              {stats.calculeAt?.toDate && ` — le ${stats.calculeAt.toDate().toLocaleString('fr-FR')}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pas encore de donnée — pas assez de cas traités pour calculer une moyenne.</p>
        )}
        <Button onClick={recalculer} disabled={recalcul}>
          <RefreshCw size={16} /> {recalcul ? 'Calcul…' : 'Recalculer'}
        </Button>
      </div>
    </div>
  );
}

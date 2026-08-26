import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, MapPin, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listenRetoursAssignes, RETOUR_STATUT_LABELS } from '../services/commandesService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';

// #nouveau (flux retour, litige gagné par l'acheteur) : tâches PRÉ-ASSIGNÉES
// (retourLivreurId déjà fixé par walletService.payerRetourLivraison côté
// maket-client, ou réassigné par un admin) — jamais de candidature, même
// principe que TourneePage (contrairement à OpportunitesPage).
export default function RetoursPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [retours, setRetours] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenRetoursAssignes(user.uid, setRetours);
    return unsub;
  }, [user?.uid]);

  if (!retours) return <Loader label="Chargement des retours…" />;

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Retours à effectuer</h1>
        <p className="text-muted-foreground mt-1">Litiges tranchés en faveur de l'acheteur : le vendeur a payé le retour, à vous de récupérer le colis.</p>
      </div>

      {retours.length === 0 ? (
        <EmptyState title="Aucun retour à effectuer" description="Les retours qui vous sont assignés apparaîtront ici." icon={RotateCcw} />
      ) : (
        <div className="space-y-2.5">
          {retours.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/retours/${c.id}`)}
              className="glass-card-elevated p-4 w-full text-left flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <RotateCcw size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{c.titreAnnonce || `Commande #${c.id.slice(0, 8).toUpperCase()}`}</p>
                {c.adresseLivraison && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                    <MapPin size={12} className="flex-shrink-0" /> Chez l'acheteur : {c.adresseLivraison.quartier}, {c.adresseLivraison.ville}
                  </p>
                )}
                <div className="mt-1.5"><StatusBadge label={RETOUR_STATUT_LABELS[c.retourStatut] || c.retourStatut} tone="amber" /></div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

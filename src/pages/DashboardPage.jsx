import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, MapPin, ChevronRight, Wallet, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  listenMesLivraisons, STATUT_LABELS, STATUTS_COMMANDE, STATUTS_TOURNEE_ACTIVE, getGains,
} from '../services/commandesService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import StatCard from '../components/common/StatCard';
import { Button } from '../components/ui/button';

const STATUT_TONES = {
  [STATUTS_COMMANDE.EN_ATTENTE_LIVREUR]: 'gray',
  [STATUTS_COMMANDE.PRIX_PROPOSE]: 'amber',
  [STATUTS_COMMANDE.LIVREUR_ASSIGNE]: 'amber',
  [STATUTS_COMMANDE.EN_ROUTE_COLLECTE]: 'blue',
  [STATUTS_COMMANDE.DEPOSE_AGENCE]: 'blue',
  [STATUTS_COMMANDE.RECUPERE_AGENCE]: 'blue',
  [STATUTS_COMMANDE.EN_ROUTE_LIVRAISON]: 'blue',
  [STATUTS_COMMANDE.RETRACTATION]: 'green',
  [STATUTS_COMMANDE.TERMINE]: 'green',
  [STATUTS_COMMANDE.ANNULE]: 'gray',
};

// Statuts qui occupent encore une place dans "en cours" côté tableau de bord —
// en plus du trajet actif (STATUTS_TOURNEE_ACTIVE), une course dont je suis
// déjà candidat compte aussi comme "en cours" (en_attente_livreur inter-villes
// en attente du second livreur, ou prix_propose en attente de l'acheteur).
const STATUTS_EN_COURS = [STATUTS_COMMANDE.EN_ATTENTE_LIVREUR, STATUTS_COMMANDE.PRIX_PROPOSE, ...STATUTS_TOURNEE_ACTIVE];

// Le schéma des commandes n'a aucun champ de délai/SLA — pas de fausse urgence
// inventée. La meilleure approximation honnête : la course qui attend depuis le
// plus longtemps dans sa phase actuelle (updatedAt le plus ancien) remonte en
// premier, plutôt qu'un ordre arbitraire de retour Firestore.
function parUrgence(rows) {
  return [...rows].sort((a, b) => {
    const ta = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || 0).getTime();
    const tb = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || 0).getTime();
    return ta - tb;
  });
}

function LivraisonCard({ c, onClick }) {
  const adresse = c.adresseLivraison || c.adressePickup;
  return (
    <button onClick={onClick} className="glass-card-elevated p-4 w-full text-left flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
        <Package size={18} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{c.titreAnnonce || `Commande #${c.id.slice(0, 8).toUpperCase()}`}</p>
        {adresse && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin size={12} className="flex-shrink-0" /> {adresse.quartier}, {adresse.ville}
          </p>
        )}
        <div className="mt-1.5"><StatusBadge label={STATUT_LABELS[c.statut] || c.statut} tone={STATUT_TONES[c.statut] || 'gray'} /></div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
    </button>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [gainsAujourdhui, setGainsAujourdhui] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    return listenMesLivraisons(user.uid, setRows);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    getGains(user.uid)
      .then(({ gains }) => setGainsAujourdhui(gains.filter((g) => new Date(g.date) >= debutJour).reduce((s, g) => s + g.montant, 0)))
      .catch(() => setGainsAujourdhui(0));
  }, [user?.uid]);

  if (rows === null) return <Loader label="Chargement de vos livraisons…" />;

  const enCours = rows.filter((c) => STATUTS_EN_COURS.includes(c.statut));
  const terminees = rows.filter((c) => !STATUTS_EN_COURS.includes(c.statut));

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Gains aujourd'hui" value={gainsAujourdhui == null ? '…' : `${gainsAujourdhui.toLocaleString('fr-FR')} XAF`} icon={Wallet} tone="success" onClick={() => navigate('/wallet')} />
        <StatCard label="Livraisons en cours" value={enCours.length} icon={Package} onClick={() => navigate('/tournee')} />
      </div>

      <Button variant="outline" className="w-full" onClick={() => navigate('/opportunites')}>
        <Compass size={16} /> Voir les opportunités disponibles
      </Button>

      {rows.length === 0 ? (
        <EmptyState title="Aucune livraison assignée" description="Candidatez sur une opportunité pour démarrer une course." icon={Package} />
      ) : (
        <>
          {enCours.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-base font-semibold text-foreground">En cours ({enCours.length})</h2>
              <div className="space-y-2.5">
                {parUrgence(enCours).map((c) => <LivraisonCard key={c.id} c={c} onClick={() => navigate(`/commandes/${c.id}`)} />)}
              </div>
            </div>
          )}

          {terminees.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-base font-semibold text-foreground">Terminées ({terminees.length})</h2>
              <div className="space-y-2.5">
                {terminees.map((c) => <LivraisonCard key={c.id} c={c} onClick={() => navigate(`/commandes/${c.id}`)} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

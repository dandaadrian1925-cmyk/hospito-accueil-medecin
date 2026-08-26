import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { MapPin, Truck, ArrowRight, ShieldAlert, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import {
  listenOpportunites, getRolesDisponibles, candidaterRamassage, candidaterLivraisonFinale,
} from '../services/commandesService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

// #nouveau (demande utilisateur, "voir les infos de l'annonce dans les
// opportunités : photos, quantité/lot, catégorie") : ces champs vivent déjà
// sur la commande elle-même (photoAnnonce, categorie, estLot, articlesLot,
// nombreArticlesLot — posés à l'achat, cf. maket-client/commandesService.js
// creerCommande), aucune lecture supplémentaire nécessaire pour eux. Seul le
// LIBELLÉ de la catégorie vit dans sa propre collection (labels gérés par le
// super-admin) — chargée une seule fois, jamais par commande.
const CATEGORY_EMOJIS = {
  electronique: '📱', electromenager: '🏠', motos: '🏍️', ordinateurs: '💻',
  vetements: '👗', chaussures: '👟', accessoires: '👜', livres: '📚',
  sport: '⚽', maison: '🛋️', autres: '📦',
};

const ERROR_MESSAGES = {
  COMMANDE_INTROUVABLE: 'Cette opportunité n\'existe plus.',
  STATUT_INVALIDE: 'Cette opportunité n\'est plus disponible.',
  DEJA_CANDIDATE: 'Un autre livreur vient de prendre ce créneau.',
  CANDIDATURE_REFUSEE: 'Votre candidature a été refusée (compte non vérifié, ville non correspondante, ou vous aviez déjà été refusé sur cette commande) — pas par un autre livreur.',
  MONTANT_INVALIDE: 'Entrez un prix valide.',
  MONTANT_TROP_ELEVE: 'Ce prix dépasse le maximum autorisé pour une livraison.',
};

// Une commande n'a jamais qu'un seul rôle réellement ouvert pour un livreur
// donné (ramassage et livraison finale supposent des villes différentes par
// définition de interVilles) — cf. getRolesDisponibles.
function OpportuniteCard({ commande, role, onCandidater, busy, categoryLabels }) {
  const [prix, setPrix] = useState('');
  const estRamassage = role === 'collecte';
  const categorieLabel = categoryLabels[commande.categorie] || commande.categorie;

  return (
    <div className="glass-card-elevated p-4 space-y-3">
      <div className="flex items-start gap-3">
        {commande.photoAnnonce && (
          <img src={commande.photoAnnonce} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-foreground truncate">{commande.titreAnnonce || `Commande #${commande.id.slice(0, 8).toUpperCase()}`}</p>
            <StatusBadge label={estRamassage ? 'Ramassage' : 'Livraison finale'} tone={estRamassage ? 'blue' : 'amber'} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Article : {(commande.montant || 0).toLocaleString('fr-FR')} XAF</p>
          {commande.categorie && (
            <p className="text-xs text-muted-foreground mt-0.5">{CATEGORY_EMOJIS[commande.categorie] || '📦'} {categorieLabel}</p>
          )}
        </div>
      </div>

      {commande.estLot && (
        <div className="flex items-start gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <Package size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Lot de {commande.nombreArticlesLot || commande.articlesLot?.length || 0} article(s)</span>
            {commande.articlesLot?.length > 0 && <span> — {commande.articlesLot.join(', ')}</span>}
          </div>
        </div>
      )}

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-muted-foreground flex-shrink-0" />
          <span><span className="text-muted-foreground">Chez le vendeur : </span>{commande.adressePickup?.quartier}, {commande.adressePickup?.ville}</span>
        </div>
        <div className="flex items-center gap-2">
          <ArrowRight size={14} className="text-muted-foreground flex-shrink-0" />
          <span><span className="text-muted-foreground">Destination : </span>{commande.adresseLivraison?.quartier}, {commande.adresseLivraison?.ville}</span>
        </div>
      </div>

      {commande.interVilles && !estRamassage && (
        <p className="text-xs text-muted-foreground italic">
          Ramassage déjà pris en charge par un autre livreur — vous assurez la livraison finale depuis l'agence.
        </p>
      )}

      <div className="flex gap-2">
        <Input
          type="number"
          min="1"
          placeholder="Votre prix (XAF)"
          value={prix}
          onChange={(e) => setPrix(e.target.value)}
          disabled={busy}
        />
        <Button
          disabled={busy || !prix || Number(prix) <= 0}
          onClick={() => onCandidater(commande.id, role, Number(prix))}
        >
          {busy ? 'Envoi…' : 'Proposer'}
        </Button>
      </div>
    </div>
  );
}

export default function OpportunitesPage() {
  const { user, userProfile } = useAuth();
  const [commandes, setCommandes] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [categoryLabels, setCategoryLabels] = useState({});

  useEffect(() => {
    getDocs(query(collection(db, 'categories'), orderBy('order', 'asc')))
      .then(snap => setCategoryLabels(Object.fromEntries(snap.docs.map(d => [d.id, d.data().label || d.id]))))
      .catch(() => {});
  }, []);

  const estVerifie = userProfile?.cniVerifie && userProfile?.contratSigne;
  const ville = userProfile?.ville;

  useEffect(() => {
    if (!estVerifie || !ville) { setCommandes([]); return; }
    return listenOpportunites(ville, setCommandes);
  }, [estVerifie, ville]);

  const handleCandidater = async (commandeId, role, prix) => {
    setBusyId(commandeId);
    try {
      if (role === 'collecte') await candidaterRamassage(commandeId, user.uid, prix);
      else await candidaterLivraisonFinale(commandeId, user.uid, prix);
      toast.success('Prix proposé — en attente de l\'acheteur');
    } catch (e) {
      toast.error(ERROR_MESSAGES[e.message] || 'Erreur lors de l\'envoi de votre proposition');
    } finally {
      setBusyId(null);
    }
  };

  if (!estVerifie) {
    return (
      <EmptyState
        title="Vérification requise"
        description="Complétez la vérification de votre CNI et signez votre contrat au bureau MAKET pour accéder aux opportunités de livraison."
        icon={ShieldAlert}
      />
    );
  }

  if (!ville) {
    return (
      <EmptyState
        title="Ville manquante"
        description="Renseignez votre ville dans votre profil pour voir les opportunités disponibles près de chez vous."
        icon={MapPin}
      />
    );
  }

  if (commandes === null) return <Loader label="Chargement des opportunités…" />;

  const visibles = commandes
    .map((c) => ({ commande: c, role: getRolesDisponibles(c, ville, user?.uid)[0] }))
    .filter(({ role }) => !!role);

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Opportunités</h1>
        <p className="text-muted-foreground mt-1">Courses disponibles à {ville}.</p>
      </div>

      {visibles.length === 0 ? (
        <EmptyState title="Aucune opportunité pour l'instant" description="Les nouvelles courses disponibles dans votre ville apparaîtront ici." icon={Truck} />
      ) : (
        <div className="space-y-3">
          {visibles.map(({ commande, role }) => (
            <OpportuniteCard
              key={commande.id}
              commande={commande}
              role={role}
              onCandidater={handleCandidater}
              busy={busyId === commande.id}
              categoryLabels={categoryLabels}
            />
          ))}
        </div>
      )}
    </div>
  );
}

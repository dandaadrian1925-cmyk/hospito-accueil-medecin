import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, MapPin, Package, Satellite, RefreshCw } from 'lucide-react';
import {
  listenCommande, confirmerRetourCollecte, confirmerRetourTermine, signalerEchecRetour,
  demanderPosition, listenPosition, updateLivreurPosition, RETOUR_STATUT_LABELS,
} from '../services/commandesService';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import DestinationMap from '../components/commandes/DestinationMap';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
// #perf : le SDK Agora (~1.2 Mo) ne doit jamais alourdir le chargement de
// cette page pour tout retour sans appel actif.
const CallWidget = lazy(() => import('../components/commandes/CallWidget'));

const ERROR_MESSAGES = {
  NON_ASSIGNE: 'Ce retour ne vous est pas assigné.',
  STATUT_INVALIDE: 'Cette action ne correspond plus à l\'état actuel du retour.',
  CODE_INVALIDE: 'Code incorrect — vérifiez-le auprès du vendeur.',
  TROP_TENTATIVES: 'Trop de tentatives incorrectes — contactez le support MAKET pour débloquer ce retour.',
};

// Même formulaire que CommandeDetailPage (FormulaireCode) — dupliqué ici
// plutôt qu'exporté, ce sont deux petits composants de page autonomes.
function FormulaireCode({ label, description, onSubmit, submitting }) {
  const [code, setCode] = useState('');
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex gap-2">
        <Input
          type="text" inputMode="numeric" maxLength={4} placeholder="XXXX"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="text-center tracking-[0.5em] font-display text-lg"
        />
        <Button disabled={submitting || code.length !== 4} onClick={() => onSubmit(code)}>
          {submitting ? 'Envoi…' : 'Confirmer'}
        </Button>
      </div>
    </div>
  );
}

// #nouveau (flux retour, litige gagné par l'acheteur) : dédiée plutôt que
// réutiliser CommandeDetailPage — retourStatut est un vocabulaire séparé du
// statut principal (qui reste 'annule' pendant tout ce flux), sans le
// split collecte/livraison-finale ni les codes secrets du parcours normal.
// #nouveau (demande utilisateur, "toujours avoir les positions de l'acheteur
// et du vendeur sur la carte" + "que le vendeur confirme aussi qu'il a reçu
// sa commande") : carte + demande de position pour les DEUX rôles (jamais un
// seul), et confirmation finale désormais par code (prive/retour_remise,
// connu du seul vendeur) plutôt qu'une simple déclaration du livreur.
export default function RetourDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [commande, setCommande] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  // #bug (retour utilisateur, "les deux boutons se lancent") : un seul état
  // partagé entre les deux boutons désactivait/relabellisait les DEUX en
  // même temps, quel que soit celui réellement cliqué (aucune vraie double
  // demande n'était envoyée — juste trompeur visuellement). Stocke
  // maintenant LE RÔLE en cours de demande (ou null), pas un simple booléen.
  const [demandingPosition, setDemandingPosition] = useState(null);
  const [maPosition, setMaPosition] = useState(null);
  const [acheteurPosition, setAcheteurPosition] = useState(null);
  const [vendeurPosition, setVendeurPosition] = useState(null);
  const [actualisationEnCours, setActualisationEnCours] = useState(false);
  const dernierEnvoi = useRef(0);

  useEffect(() => {
    const unsub = listenCommande(id, setCommande, () => setCommande(null));
    return unsub;
  }, [id]);

  const positionActive = !!commande && ['paye', 'collecte'].includes(commande.retourStatut) && commande.retourLivreurId === user?.uid;

  // Suivi live de ma propre position pendant tout le retour — même limite
  // d'1 écriture/12s que CommandeDetailPage.
  useEffect(() => {
    if (!positionActive || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setMaPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const maintenant = Date.now();
        if (maintenant - dernierEnvoi.current < 12000) return;
        dernierEnvoi.current = maintenant;
        updateLivreurPosition(id, pos.coords.latitude, pos.coords.longitude).catch((e) => {
          console.error('updateLivreurPosition (retour) a échoué :', e);
        });
      },
      (e) => console.error('Géolocalisation refusée/indisponible (retour) :', e),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [id, positionActive]);

  // #nouveau (demande utilisateur, "le livreur doit pouvoir actualiser sa
  // position à chaque fois qu'il le souhaite") : même principe que
  // CommandeDetailPage — contourne le délai de 12s sur demande explicite.
  // #bug (retour utilisateur, "délai dépassé") : même correctif que
  // CommandeDetailPage — repli sur la dernière position déjà connue du suivi
  // en direct (watchPosition) si la tentative fraîche dépasse le délai.
  const handleActualiserPosition = () => {
    if (!navigator.geolocation) return;
    setActualisationEnCours(true);
    const ecrire = (lat, lng, messageSucces) => {
      setMaPosition({ lat, lng });
      dernierEnvoi.current = Date.now();
      updateLivreurPosition(id, lat, lng)
        .then(() => toast.success(messageSucces))
        .catch(() => toast.error('Échec de l\'actualisation de la position'))
        .finally(() => setActualisationEnCours(false));
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => ecrire(pos.coords.latitude, pos.coords.longitude, 'Position actualisée'),
      (err) => {
        if (maPosition) {
          ecrire(maPosition.lat, maPosition.lng, 'Position actualisée (dernière position connue du suivi en direct)');
          return;
        }
        const messages = {
          1: 'Autorisation de localisation refusée — vérifiez les paramètres du site dans votre navigateur.',
          2: 'Position indisponible pour le moment (signal GPS/réseau faible) — réessayez dans quelques secondes.',
          3: 'Délai dépassé en essayant d\'obtenir votre position — réessayez.'
        };
        toast.error(messages[err.code] || 'Impossible d\'obtenir votre position.');
        setActualisationEnCours(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };

  // Position de l'acheteur ET du vendeur, TOUTES LES DEUX écoutées en
  // permanence pendant le retour (demande utilisateur explicite) — jamais
  // une seule selon la phase en cours.
  useEffect(() => {
    if (!positionActive) { setAcheteurPosition(null); return; }
    return listenPosition(id, 'acheteur', setAcheteurPosition);
  }, [id, positionActive]);
  useEffect(() => {
    if (!positionActive) { setVendeurPosition(null); return; }
    return listenPosition(id, 'vendeur', setVendeurPosition);
  }, [id, positionActive]);

  if (commande === undefined) return <Loader label="Chargement du retour…" />;
  if (!commande || commande.retourLivreurId !== user?.uid) {
    return <EmptyState title="Retour introuvable" description="Ce retour n'existe pas ou ne vous est pas assigné." icon={Package} />;
  }

  const gererErreur = (e) => toast.error(ERROR_MESSAGES[e.message] || 'Erreur');

  const handleCollecte = async () => {
    setSubmitting(true);
    try {
      await confirmerRetourCollecte(id, user.uid);
      toast.success('Collecte confirmée — direction le vendeur.');
    } catch (e) {
      gererErreur(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTermine = async (code) => {
    setSubmitting(true);
    try {
      await confirmerRetourTermine(id, user.uid, code);
      toast.success('Retour terminé — merci !');
    } catch (e) {
      gererErreur(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEchec = async () => {
    if (!window.confirm('Confirmer que l\'acheteur refuse de rendre l\'article (ou reste injoignable) ? Un admin sera prévenu pour réassigner ce retour.')) return;
    setSubmitting(true);
    try {
      await signalerEchecRetour(id, user.uid);
      toast.success('Signalé — un admin va réassigner ce retour.');
      navigate('/retours');
    } catch (e) {
      gererErreur(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemanderPosition = async (role) => {
    const targetUserId = role === 'acheteur' ? commande.acheteurId : commande.vendeurId;
    setDemandingPosition(role);
    try {
      await demanderPosition(id, role, targetUserId, commande.titreAnnonce);
      toast.success('Demande envoyée');
    } catch (e) {
      toast.error('Erreur lors de la demande');
    } finally {
      setDemandingPosition(null);
    }
  };

  // Destination affichée selon la phase — même logique que CommandeDetailPage.
  const pointDestination = commande.retourStatut === 'paye' ? commande.destinationGeocode : commande.pickupGeocode;

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <button onClick={() => navigate('/retours')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> Retours à effectuer
      </button>

      <div className="glass-card-elevated p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">{commande.titreAnnonce || `Commande #${id.slice(0, 8).toUpperCase()}`}</h1>
            <p className="text-sm text-muted-foreground mt-1">Litige tranché en faveur de l'acheteur — retour de l'article au vendeur.</p>
          </div>
          <StatusBadge label={RETOUR_STATUT_LABELS[commande.retourStatut] || commande.retourStatut} tone="amber" />
        </div>

        {positionActive && pointDestination && (
          <>
            <DestinationMap destination={pointDestination} position={maPosition} vendeurPosition={vendeurPosition} acheteurPosition={acheteurPosition} />
            <Button variant="outline" size="sm" className="w-full" disabled={actualisationEnCours} onClick={handleActualiserPosition}>
              <RefreshCw size={14} className={actualisationEnCours ? 'animate-spin' : ''} /> {actualisationEnCours ? 'Actualisation…' : 'Actualiser ma position'}
            </Button>
          </>
        )}

        {positionActive && (
          <Suspense fallback={null}>
            <CallWidget
              commandeId={id}
              contexte={commande.retourStatut === 'paye' ? 'acheteur' : 'vendeur'}
              appelEnCours={commande.appelEnCours}
              currentUid={user?.uid}
              label={commande.retourStatut === 'paye' ? "Appeler l'acheteur" : 'Appeler le vendeur'}
            />
          </Suspense>
        )}

        {commande.retourStatut === 'paye' && (
          <div className="space-y-3">
            {commande.adresseLivraison && (
              <p className="text-sm text-foreground flex items-center gap-1.5">
                <MapPin size={14} className="flex-shrink-0" /> Récupérer chez l'acheteur : {commande.adresseLivraison.quartier}, {commande.adresseLivraison.ville}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Le vendeur a payé le double des frais de livraison. Rendez-vous chez l'acheteur pour récupérer le colis, puis confirmez ci-dessous.
            </p>
            <Button className="w-full" onClick={handleCollecte} disabled={submitting}>
              {submitting ? 'Confirmation…' : 'J\'ai récupéré le colis'}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleEchec} disabled={submitting}>
              L'acheteur refuse / injoignable
            </Button>
          </div>
        )}

        {commande.retourStatut === 'collecte' && (
          <div className="space-y-3">
            {commande.adressePickup && (
              <p className="text-sm text-foreground flex items-center gap-1.5">
                <MapPin size={14} className="flex-shrink-0" /> Remettre au vendeur : {commande.adressePickup.quartier}, {commande.adressePickup.ville}
              </p>
            )}
            <FormulaireCode
              label="Code de confirmation du vendeur"
              description="Demandez au vendeur son code de confirmation (donné lors du paiement du retour) et saisissez-le ici pour clôturer le retour."
              onSubmit={handleTermine}
              submitting={submitting}
            />
          </div>
        )}

        {positionActive && (
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="w-full" disabled={!!demandingPosition} onClick={() => handleDemanderPosition('acheteur')}>
              <Satellite size={16} /> {demandingPosition === 'acheteur' ? 'Envoi…' : 'Demander la position de l\'acheteur'}
            </Button>
            <Button variant="outline" className="w-full" disabled={!!demandingPosition} onClick={() => handleDemanderPosition('vendeur')}>
              <Satellite size={16} /> {demandingPosition === 'vendeur' ? 'Envoi…' : 'Demander la position du vendeur'}
            </Button>
          </div>
        )}

        {commande.retourStatut === 'termine' && (
          <p className="text-sm text-green-600 font-medium">Retour terminé — merci.</p>
        )}

        {commande.retourStatut === 'echoue' && (
          <p className="text-sm text-muted-foreground">Signalé comme échoué — un admin va réassigner ce retour si nécessaire. Rien d'autre à faire de votre côté.</p>
        )}
      </div>
    </div>
  );
}

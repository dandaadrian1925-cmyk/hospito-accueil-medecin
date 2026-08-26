import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Navigation, Truck, CheckCircle, MessageCircle,
  Camera, X, Satellite, Building2, Clock, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listenCommande, confirmerCollecte, confirmerRemiseFinale, deposerAgence, recupererAgence,
  demarrerLivraisonFinale, updateLivreurPosition, updateDestinationGeocode,
  updatePickupGeocode, listenPosition, demanderPosition, suisJeActifPourPosition,
  getIdentitesReelles, STATUTS_COMMANDE, STATUT_LABELS, STATUTS_POSITION_ACTIVE,
  contrePropositionLivreur, accepterContrePropositionAcheteur,
} from '../../services/commandesService';
import { geocoderAdresse } from '../../services/geocodingService';
import { getOrCreateConversation } from '../../services/chatService';
import { uploadFile, resoudreUrlsLivraison } from '../../supabase/config';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import DestinationMap from '../../components/commandes/DestinationMap';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
// #perf : le SDK Agora (~1.2 Mo) ne doit jamais alourdir le chargement de
// cette page pour toute commande sans appel actif.
const CallWidget = lazy(() => import('../../components/commandes/CallWidget'));

const ERROR_MESSAGES = {
  COMMANDE_INTROUVABLE: 'Cette commande est introuvable.',
  NON_ASSIGNE: 'Cette livraison ne vous est pas assignée.',
  STATUT_INVALIDE: 'Cette commande n\'est plus dans le bon statut pour cette action.',
  CODE_INVALIDE: 'Code incorrect — vérifiez-le auprès de votre interlocuteur.',
  TROP_TENTATIVES: 'Trop de tentatives incorrectes — contactez le support MAKET pour débloquer cette commande.',
  PREUVE_MANQUANTE: 'Ajoutez une photo avant de continuer.',
  TYPE_FICHIER_NON_AUTORISE: 'Type de fichier non autorisé (JPG, PNG ou WEBP uniquement).',
  FICHIER_TROP_VOLUMINEUX: 'Fichier trop volumineux (10 Mo maximum).',
  MONTANT_INVALIDE: 'Entrez un prix valide.',
  MONTANT_TROP_ELEVE: 'Ce prix dépasse le maximum autorisé.',
  PAS_VOTRE_TOUR: "Ce n'est pas votre tour — attendez la réponse de l'acheteur.",
  LIMITE_NEGOCIATION_ATTEINTE: 'Limite de contre-propositions atteinte pour cette commande.',
  COMMANDE_INVALIDE: 'Cette livraison ne vous est pas assignée.',
};

// Petit formulaire de saisie de code à 4 chiffres — réutilisé pour le code de
// collecte (vendeur) et le code de remise finale (acheteur), cf.
// commandesService.confirmerCollecte / confirmerRemiseFinale. Le code lui-même
// n'est JAMAIS lisible par le livreur (cf. firestore.rules, prive/collecte et
// prive/remise) : il ne peut que le saisir, la vérification se fait côté serveur.
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

// Bloc "photo obligatoire" pour les étapes d'agence (inter-villes) — pas de code
// ici (l'agence n'a pas de compte MAKET), juste une preuve photo du reçu/numéro
// de suivi, cf. plan #livraison.
function FormulairePreuvePhoto({ label, buttonLabel, onSubmit, submitting }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choisir = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={choisir} />
      {preview ? (
        <div className="relative w-32 h-32">
          <img src={preview} alt="Preuve" className="w-32 h-32 object-cover rounded-xl border border-border" />
          <button type="button" onClick={() => { URL.revokeObjectURL(preview); setFile(null); setPreview(null); }} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
            <X size={13} />
          </button>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
          <Camera size={16} /> Prendre une photo du reçu
        </Button>
      )}
      <Button className="w-full" disabled={submitting || !file} onClick={() => onSubmit(file)}>
        {submitting ? 'Envoi…' : buttonLabel}
      </Button>
    </div>
  );
}

export default function CommandeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [commande, setCommande] = useState(null);
  const [identites, setIdentites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showContreProposition, setShowContreProposition] = useState(false);
  const [montantContreProposition, setMontantContreProposition] = useState('');
  const [negociationLoading, setNegociationLoading] = useState(false);
  const [demandingPosition, setDemandingPosition] = useState(false);
  const [partagePosition, setPartagePosition] = useState(null); // null=inactif | 'actif' | 'refuse'
  const [maPosition, setMaPosition] = useState(null);
  const [acheteurPosition, setAcheteurPosition] = useState(null);
  const [vendeurPosition, setVendeurPosition] = useState(null);
  const [preuvesAgenceUrls, setPreuvesAgenceUrls] = useState({ depot: null, recuperation: null });
  const dernierEnvoi = useRef(0);
  const geocodagePickupEnCours = useRef(false);
  const geocodageLivraisonEnCours = useRef(false);
  const [actualisationEnCours, setActualisationEnCours] = useState(false);

  useEffect(() => {
    setLoading(true);
    setAccessDenied(false);
    return listenCommande(
      id,
      (c) => { setCommande(c); setLoading(false); },
      (e) => {
        console.error('listenCommande a échoué :', e);
        setAccessDenied(true);
        setLoading(false);
      }
    );
  }, [id]);

  // Bucket "litiges" (réutilisé pour les preuves agence) rendu privé — les
  // URLs stockées sur la commande, publiques à l'origine, ne sont plus
  // directement accessibles. cf. supabase/config.js::resoudreUrlsLivraison.
  useEffect(() => {
    if (!commande?.preuveAgenceDepotUrl && !commande?.preuveAgenceRecuperationUrl) return;
    resoudreUrlsLivraison(id, [commande.preuveAgenceDepotUrl, commande.preuveAgenceRecuperationUrl])
      .then(([depot, recuperation]) => setPreuvesAgenceUrls({ depot, recuperation }));
  }, [id, commande?.preuveAgenceDepotUrl, commande?.preuveAgenceRecuperationUrl]);

  const estCollecteur = !!user && commande?.livreurCollecteId === user.uid;
  const estLivraisonFinale = !!user && commande?.livreurLivraisonId === user.uid;
  const positionActivePourMoi = !!commande && !!user && suisJeActifPourPosition(commande, user.uid);

  // #confidentialité (variant analysis) : les vrais noms vivent désormais dans
  // un sous-document dédié (cf. firestore.rules, commandes/{id}/prive/identites),
  // lisible seulement une fois RÉELLEMENT assigné — jamais pendant la simple
  // consultation d'une opportunité (accessDenied côté règles sinon, avalé par
  // getIdentitesReelles qui retourne null proprement dans ce cas).
  useEffect(() => {
    if (!commande?.id || !(estCollecteur || estLivraisonFinale)) { setIdentites(null); return; }
    getIdentitesReelles(commande.id).then(setIdentites);
  }, [commande?.id, estCollecteur, estLivraisonFinale]);

  // Partage de position en direct — actif uniquement pendant les statuts de
  // trajet où c'est MON tour d'être en mouvement (cf. suisJeActifPourPosition) ;
  // en inter-villes, seul le livreur concerné par l'étape en cours partage.
  // Écritures Firestore limitées à 1 toutes les 12s (watchPosition peut
  // déclencher beaucoup plus souvent).
  useEffect(() => {
    if (!positionActivePourMoi || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPartagePosition('actif');
        setMaPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const maintenant = Date.now();
        if (maintenant - dernierEnvoi.current < 12000) return;
        dernierEnvoi.current = maintenant;
        updateLivreurPosition(id, pos.coords.latitude, pos.coords.longitude).catch((e) => {
          console.error('updateLivreurPosition a échoué :', e);
        });
      },
      (err) => {
        console.error('Géolocalisation refusée/indisponible :', err);
        setPartagePosition('refuse');
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [id, positionActivePourMoi]);

  // #nouveau (demande utilisateur, "le livreur doit pouvoir actualiser sa
  // position à chaque fois qu'il le souhaite") : contourne volontairement le
  // délai de 12s (watchPosition) pour donner sa vraie position À CET INSTANT,
  // sur demande explicite plutôt que d'attendre le prochain cycle.
  // #bug (retour utilisateur, "délai dépassé") : une position FRAÎCHE en une
  // seule tentative (maximumAge:0 + enableHighAccuracy) peut légitimement
  // dépasser 20s (GPS lent à se fixer, surtout en intérieur) — alors que le
  // suivi continu (watchPosition, ci-dessus) tourne déjà et alimente
  // maPosition en temps réel. Si la tentative fraîche échoue, on n'affiche
  // plus une simple erreur : on écrit immédiatement la dernière position déjà
  // connue du suivi actif, presque toujours suffisamment récente.
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

  // Le trajet vers l'acheteur (même-ville : en_route_collecte ; inter-villes :
  // en_route_livraison) est le seul moment où sa position ponctuelle a un sens
  // à demander — avant ça, le livreur n'a même pas encore l'article.
  const versAcheteur = !!commande && (
    (commande.statut === STATUTS_COMMANDE.EN_ROUTE_COLLECTE && !commande.interVilles)
    || commande.statut === STATUTS_COMMANDE.EN_ROUTE_LIVRAISON
  ) && positionActivePourMoi;

  // #nouveau (demande utilisateur, "le livreur pourrait aussi demander la
  // position du vendeur") : symétrique de versAcheteur, mais sur le trajet
  // vers le vendeur (avant collecte) — jamais les deux en même temps.
  const versVendeur = !!commande && commande.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE && positionActivePourMoi;

  // #nouveau (demande utilisateur, "appels livreur-livreur pour l'inter-ville
  // et client-livreur uniquement pour le moment") : contrairement à
  // positionActivePourMoi (une seule des deux étapes à la fois), l'appel
  // reste disponible tout le trajet dès qu'on est réellement assigné —
  // qu'on soit le collecteur ou le livreur de la livraison finale.
  const appelPrincipalDisponible = !!commande && (estCollecteur || estLivraisonFinale) &&
    STATUTS_POSITION_ACTIVE.includes(commande.statut);
  // Relais inter-villes : les deux rôles doivent être assignés à deux comptes
  // distincts — sinon rien à négocier seul (même vérification côté agora-token).
  const appelRelaisDisponible = !!commande && commande.interVilles &&
    !!commande.livreurCollecteId && !!commande.livreurLivraisonId &&
    commande.livreurCollecteId !== commande.livreurLivraisonId &&
    (estCollecteur || estLivraisonFinale);

  useEffect(() => {
    if (!versAcheteur) { setAcheteurPosition(null); return; }
    return listenPosition(id, 'acheteur', setAcheteurPosition);
  }, [id, versAcheteur]);

  useEffect(() => {
    if (!versVendeur) { setVendeurPosition(null); return; }
    return listenPosition(id, 'vendeur', setVendeurPosition);
  }, [id, versVendeur]);

  // Géocode les deux adresses une seule fois par commande chacune, dès qu'elles
  // sont disponibles, peu importe la phase actuelle.
  useEffect(() => {
    const adresse = commande?.adressePickup;
    if (!adresse?.quartier || commande?.pickupGeocode || geocodagePickupEnCours.current) return;
    geocodagePickupEnCours.current = true;
    geocoderAdresse(adresse.quartier, adresse.ville)
      .then(({ lat, lng }) => updatePickupGeocode(id, lat, lng))
      .catch((e) => console.error('Géocodage du ramassage échoué :', e))
      .finally(() => { geocodagePickupEnCours.current = false; });
  }, [id, commande?.adressePickup, commande?.pickupGeocode]);

  useEffect(() => {
    const adresse = commande?.adresseLivraison;
    if (!adresse?.quartier || commande?.destinationGeocode || geocodageLivraisonEnCours.current) return;
    geocodageLivraisonEnCours.current = true;
    geocoderAdresse(adresse.quartier, adresse.ville)
      .then(({ lat, lng }) => updateDestinationGeocode(id, lat, lng))
      .catch((e) => console.error('Géocodage de la livraison échoué :', e))
      .finally(() => { geocodageLivraisonEnCours.current = false; });
  }, [id, commande?.adresseLivraison, commande?.destinationGeocode]);

  if (loading) return <Loader />;
  if (accessDenied) return <EmptyState title="Cette livraison ne vous est pas accessible" />;
  if (!commande) return <EmptyState title="Commande introuvable" />;

  const fraisTotal = (commande.fraisLivraison || 0) + (commande.interVilles ? (commande.fraisLivraisonInterVilles || 0) : 0);

  const gererErreur = (e) => toast.error(ERROR_MESSAGES[e.message] || 'Erreur');

  const handleContreProposition = async () => {
    const montant = parseInt(montantContreProposition, 10);
    if (!(montant > 0)) { toast.error('Entrez un prix valide.'); return; }
    setNegociationLoading(true);
    try {
      await contrePropositionLivreur(id, user.uid, montant);
      toast.success('Contre-proposition envoyée à l\'acheteur.');
      setShowContreProposition(false);
      setMontantContreProposition('');
    } catch (e) { gererErreur(e); } finally { setNegociationLoading(false); }
  };

  const handleAccepterContreProposition = async () => {
    setNegociationLoading(true);
    try {
      await accepterContrePropositionAcheteur(id, user.uid);
      toast.success('Prix accepté — en attente du paiement de l\'acheteur.');
    } catch (e) { gererErreur(e); } finally { setNegociationLoading(false); }
  };

  const handleConfirmerCollecte = async (code) => {
    setSubmitting(true);
    try {
      await confirmerCollecte(id, user.uid, code);
      toast.success('Collecte confirmée');
    } catch (e) { gererErreur(e); } finally { setSubmitting(false); }
  };

  const handleConfirmerRemiseFinale = async (code) => {
    setSubmitting(true);
    try {
      await confirmerRemiseFinale(id, user.uid, code);
      toast.success('Livraison confirmée');
    } catch (e) { gererErreur(e); } finally { setSubmitting(false); }
  };

  const handleDeposerAgence = async (file) => {
    setSubmitting(true);
    try {
      const upload = await uploadFile('litiges', `livraison/${id}/${Date.now()}_agence_depot`, file);
      await deposerAgence(id, user.uid, upload.publicUrl);
      toast.success('Dépôt à l\'agence confirmé');
    } catch (e) { gererErreur(e); } finally { setSubmitting(false); }
  };

  const handleRecupererAgence = async (file) => {
    setSubmitting(true);
    try {
      const upload = await uploadFile('litiges', `livraison/${id}/${Date.now()}_agence_recuperation`, file);
      await recupererAgence(id, user.uid, upload.publicUrl);
      toast.success('Récupération à l\'agence confirmée');
    } catch (e) { gererErreur(e); } finally { setSubmitting(false); }
  };

  const handleDemarrerLivraisonFinale = async () => {
    setSubmitting(true);
    try {
      await demarrerLivraisonFinale(id, user.uid);
      toast.success('Livraison finale démarrée');
    } catch (e) { gererErreur(e); } finally { setSubmitting(false); }
  };

  const handleDemanderPosition = async () => {
    setDemandingPosition(true);
    try {
      await demanderPosition(id, 'acheteur', commande.acheteurId, commande.titreAnnonce);
      toast.success('Demande envoyée');
    } catch (e) {
      toast.error('Erreur lors de la demande');
    } finally {
      setDemandingPosition(false);
    }
  };

  const handleDemanderPositionVendeur = async () => {
    setDemandingPosition(true);
    try {
      await demanderPosition(id, 'vendeur', commande.vendeurId, commande.titreAnnonce);
      toast.success('Demande envoyée');
    } catch (e) {
      toast.error('Erreur lors de la demande');
    } finally {
      setDemandingPosition(false);
    }
  };

  // #confidentialité : le livreur (contrairement aux clients entre eux) a
  // besoin du VRAI nom pour identifier les gens sur le terrain — dénormalisé
  // sur la commande à sa création (cf. creerCommande, maket-client), jamais
  // via profils_publics qui n'affiche plus qu'un pseudo.
  const handleContacter = async (autreUserId, nomReel) => {
    try {
      const convId = await getOrCreateConversation(user.uid, autreUserId, commande.annonceId);
      navigate(`/chat/${convId}`, { state: { nomReel } });
    } catch (e) {
      toast.error('Impossible d\'ouvrir la conversation');
    }
  };

  // Adresse/carte pertinente selon la phase — null quand l'étape en cours n'a
  // pas de destination connue (agence : ni géocodée, ni un vrai lieu MAKET).
  let adresseAffichee = null;
  let libelleAdresse = '';
  let pointDestination = null;
  let carteActive = false;
  if (commande.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE && estCollecteur) {
    adresseAffichee = commande.adressePickup;
    libelleAdresse = 'Chez le vendeur';
    pointDestination = commande.pickupGeocode;
    carteActive = true;
  } else if (commande.statut === STATUTS_COMMANDE.EN_ROUTE_COLLECTE && !commande.interVilles) {
    adresseAffichee = commande.adresseLivraison;
    libelleAdresse = 'Chez l\'acheteur';
    pointDestination = commande.destinationGeocode;
    carteActive = true;
  } else if (commande.statut === STATUTS_COMMANDE.EN_ROUTE_LIVRAISON) {
    adresseAffichee = commande.adresseLivraison;
    libelleAdresse = 'Chez l\'acheteur';
    pointDestination = commande.destinationGeocode;
    carteActive = true;
  }

  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <Button variant="ghost" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> Retour
      </Button>

      <div className="glass-card-elevated p-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="font-display text-xl font-bold text-foreground">{commande.titreAnnonce || `Commande #${id.slice(0, 8).toUpperCase()}`}</h2>
          <StatusBadge label={STATUT_LABELS[commande.statut] || commande.statut} tone="blue" />
        </div>

        {adresseAffichee?.quartier && (
          <div className="mb-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                <span><span className="font-semibold">{libelleAdresse} :</span> {adresseAffichee.quartier}, {adresseAffichee.ville}</span>
              </div>
              {// #nouveau (demande utilisateur, "on ne redirige pas hors de
              // l'app") : le lien externe ne reste qu'en secours, quand
              // aucune carte in-app n'est encore disponible (coordonnées pas
              // encore géocodées, ou étape sans carte) — jamais en plus d'une
              // carte déjà affichée.
              !(carteActive && pointDestination) && <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${adresseAffichee.quartier}, ${adresseAffichee.ville}, Cameroun`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline flex-shrink-0"
              >
                <Navigation size={13} /> Ouvrir dans Google Maps
              </a>}
            </div>
            {carteActive && (pointDestination ? (
              <DestinationMap destination={pointDestination} position={maPosition} vendeurPosition={vendeurPosition} acheteurPosition={acheteurPosition} />
            ) : (
              <p className="text-xs text-muted-foreground italic">Chargement de la carte…</p>
            ))}
            {carteActive && positionActivePourMoi && (
              <Button variant="outline" size="sm" className="w-full mt-2" disabled={actualisationEnCours} onClick={handleActualiserPosition}>
                <RefreshCw size={14} className={actualisationEnCours ? 'animate-spin' : ''} /> {actualisationEnCours ? 'Actualisation…' : 'Actualiser ma position'}
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 text-sm">
          <div><span className="text-muted-foreground">Prix article : </span>{(commande.montant || 0).toLocaleString('fr-FR')} XAF</div>
          <div><span className="text-muted-foreground">Frais livraison : </span>{fraisTotal.toLocaleString('fr-FR')} XAF</div>
        </div>
      </div>

      {(appelPrincipalDisponible || appelRelaisDisponible) && (
        <Suspense fallback={null}>
          <div className="space-y-2.5">
            {appelPrincipalDisponible && (
              <CallWidget
                commandeId={id}
                contexte={estCollecteur && commande.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE ? 'vendeur' : 'acheteur'}
                appelEnCours={commande.appelEnCours}
                currentUid={user?.uid}
                label={estCollecteur && commande.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE ? 'Appeler le vendeur' : "Appeler l'acheteur"}
              />
            )}
            {appelRelaisDisponible && (
              <CallWidget
                commandeId={id}
                contexte="relais"
                appelEnCours={commande.appelEnCours}
                currentUid={user?.uid}
                label={estCollecteur ? 'Appeler le livreur de livraison finale' : 'Appeler le livreur de collecte'}
              />
            )}
          </div>
        </Suspense>
      )}

      {positionActivePourMoi && (
        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded-lg glass-card-elevated ${
          partagePosition === 'actif' ? 'text-success' : partagePosition === 'refuse' ? 'text-destructive' : 'text-muted-foreground'
        }`}>
          <Satellite size={14} className="flex-shrink-0" />
          {partagePosition === 'actif' && 'Position partagée en direct'}
          {partagePosition === 'refuse' && 'Géolocalisation refusée — activez-la dans les réglages du navigateur pour partager votre position'}
          {!partagePosition && 'Activation du partage de position…'}
        </div>
      )}

      {versAcheteur && (
        <Button variant="outline" className="w-full" disabled={demandingPosition} onClick={handleDemanderPosition}>
          <Satellite size={16} /> {demandingPosition ? 'Envoi…' : 'Demander la position de l\'acheteur'}
        </Button>
      )}

      {versVendeur && (
        <Button variant="outline" className="w-full" disabled={demandingPosition} onClick={handleDemanderPositionVendeur}>
          <Satellite size={16} /> {demandingPosition ? 'Envoi…' : 'Demander la position du vendeur'}
        </Button>
      )}

      <div className="glass-card-elevated p-6 space-y-3">
        {commande.statut === STATUTS_COMMANDE.EN_ATTENTE_LIVREUR && (
          <p className="text-sm text-muted-foreground text-center py-2 flex items-center justify-center gap-2">
            <Clock size={15} /> En attente qu'un second livreur accepte la livraison finale à {commande.adresseLivraison?.ville}.
          </p>
        )}

        {commande.statut === STATUTS_COMMANDE.PRIX_PROPOSE && (
          commande.interVilles || (commande.negociationProposePar || 'livreur') === 'livreur' ? (
            <p className="text-sm text-muted-foreground text-center py-2 flex items-center justify-center gap-2">
              <Clock size={15} /> En attente que l'acheteur accepte et paie les frais de livraison ({fraisTotal.toLocaleString('fr-FR')} XAF).
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground text-center font-semibold">
                L'acheteur propose {fraisTotal.toLocaleString('fr-FR')} XAF au lieu de votre prix initial.
              </p>
              {showContreProposition ? (
                <div className="flex gap-2">
                  <Input
                    type="number" min="1" placeholder="Votre prix (XAF)"
                    value={montantContreProposition} onChange={(e) => setMontantContreProposition(e.target.value)}
                    disabled={negociationLoading}
                  />
                  <Button disabled={negociationLoading || !montantContreProposition} onClick={handleContreProposition}>
                    {negociationLoading ? 'Envoi…' : 'Envoyer'}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={negociationLoading} onClick={() => setShowContreProposition(true)}>
                    Contre-proposer
                  </Button>
                  <Button className="flex-1" disabled={negociationLoading} onClick={handleAccepterContreProposition}>
                    {negociationLoading ? '…' : 'Accepter ce prix'}
                  </Button>
                </div>
              )}
            </div>
          )
        )}

        {commande.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE && (
          estCollecteur ? (
            <FormulaireCode
              label="Code de ramassage"
              description="Demandez au vendeur son code à 4 chiffres pour confirmer que vous avez bien récupéré l'article."
              onSubmit={handleConfirmerCollecte}
              submitting={submitting}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2 flex items-center justify-center gap-2">
              <Clock size={15} /> En attente que le livreur de ramassage récupère l'article chez le vendeur.
            </p>
          )
        )}

        {commande.statut === STATUTS_COMMANDE.EN_ROUTE_COLLECTE && !commande.interVilles && (
          <FormulaireCode
            label="Code de remise"
            description="Demandez à l'acheteur son code à 4 chiffres pour confirmer la remise finale."
            onSubmit={handleConfirmerRemiseFinale}
            submitting={submitting}
          />
        )}

        {commande.statut === STATUTS_COMMANDE.EN_ROUTE_COLLECTE && commande.interVilles && (
          estCollecteur ? (
            <FormulairePreuvePhoto
              label="Déposez l'article à l'agence de transport et prenez une photo du reçu/numéro de suivi."
              buttonLabel="Confirmer le dépôt à l'agence"
              onSubmit={handleDeposerAgence}
              submitting={submitting}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2 flex items-center justify-center gap-2">
              <Building2 size={15} /> Le livreur de ramassage est en route vers l'agence de dépôt.
            </p>
          )
        )}

        {commande.statut === STATUTS_COMMANDE.DEPOSE_AGENCE && (
          estLivraisonFinale ? (
            <FormulairePreuvePhoto
              label="Récupérez l'article au guichet de l'agence et prenez une photo du reçu."
              buttonLabel="Confirmer la récupération à l'agence"
              onSubmit={handleRecupererAgence}
              submitting={submitting}
            />
          ) : (
            <div className="space-y-2 text-center py-2">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Building2 size={15} /> Déposé à l'agence — en attente de récupération par le second livreur.
              </p>
              {preuvesAgenceUrls.depot && (
                <img src={preuvesAgenceUrls.depot} alt="Preuve de dépôt" className="w-24 h-24 object-cover rounded-lg border border-border mx-auto" />
              )}
            </div>
          )
        )}

        {commande.statut === STATUTS_COMMANDE.RECUPERE_AGENCE && (
          estLivraisonFinale ? (
            <Button className="w-full" disabled={submitting} onClick={handleDemarrerLivraisonFinale}>
              <Truck size={16} /> {submitting ? 'Envoi…' : 'Démarrer la livraison finale'}
            </Button>
          ) : (
            <div className="space-y-2 text-center py-2">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Building2 size={15} /> Récupéré à l'agence par le second livreur — livraison finale en préparation.
              </p>
              {preuvesAgenceUrls.recuperation && (
                <img src={preuvesAgenceUrls.recuperation} alt="Preuve de récupération" className="w-24 h-24 object-cover rounded-lg border border-border mx-auto" />
              )}
            </div>
          )
        )}

        {commande.statut === STATUTS_COMMANDE.EN_ROUTE_LIVRAISON && (
          estLivraisonFinale ? (
            <FormulaireCode
              label="Code de remise"
              description="Demandez à l'acheteur son code à 4 chiffres pour confirmer la remise finale."
              onSubmit={handleConfirmerRemiseFinale}
              submitting={submitting}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">Livraison finale en cours par le second livreur.</p>
          )
        )}

        {[STATUTS_COMMANDE.RETRACTATION, STATUTS_COMMANDE.TERMINE].includes(commande.statut) && (
          <p className="text-sm text-muted-foreground text-center py-2 flex items-center justify-center gap-2">
            <CheckCircle size={15} className="text-success" /> Livraison terminée, rien à faire de plus.
          </p>
        )}

        {commande.statut === STATUTS_COMMANDE.ANNULE && (
          <p className="text-sm text-muted-foreground text-center py-2">Cette commande a été annulée.</p>
        )}

        {commande.statut === STATUTS_COMMANDE.LITIGE && (
          <p className="text-sm text-muted-foreground text-center py-2">Un litige est en cours sur cette commande.</p>
        )}
      </div>

      {/* ÉLEVÉE (audit sécurité, corrigé) : ces boutons s'affichaient pour
          toute commande visible comme opportunité, pas seulement celles
          assignées — contrairement à identites (noms réels), déjà
          correctement protégé par estCollecteur || estLivraisonFinale. Un
          livreur pouvait ouvrir un chat avec l'acheteur/le vendeur d'une
          commande à laquelle il n'a aucun rôle légitime. */}
      {(estCollecteur || estLivraisonFinale) && (
        <div className="glass-card-elevated p-6 space-y-2.5">
          <h3 className="font-display text-base font-semibold text-foreground mb-1">Contact</h3>
          {commande.acheteurId && (
            <Button variant="outline" className="w-full" onClick={() => handleContacter(commande.acheteurId, identites?.acheteurNomReel)}>
              <MessageCircle size={15} /> Contacter l'acheteur{identites?.acheteurNomReel ? ` (${identites.acheteurNomReel})` : ''}
            </Button>
          )}
          {commande.vendeurId && (
            <Button variant="outline" className="w-full" onClick={() => handleContacter(commande.vendeurId, identites?.vendeurNomReel)}>
              <MessageCircle size={15} /> Contacter le vendeur{identites?.vendeurNomReel ? ` (${identites.vendeurNomReel})` : ''}
            </Button>
          )}
        </div>
      )}

      <div className="glass-card-elevated p-6">
        <h3 className="font-display text-base font-semibold text-foreground mb-3.5">Historique</h3>
        <div className="divide-y divide-border">
          {(commande.historiqueStatuts || []).map((h, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5">
              <span className="font-semibold text-foreground">{STATUT_LABELS[h.statut] || h.statut}</span>
              <span className="text-muted-foreground">{new Date(h.date).toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

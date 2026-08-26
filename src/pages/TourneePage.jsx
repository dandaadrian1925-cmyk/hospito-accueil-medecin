import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Package, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getTourneeActuelle, updatePickupGeocode, updateDestinationGeocode,
  STATUT_LABELS, STATUTS_COMMANDE,
} from '../services/commandesService';
import { geocoderAdresse } from '../services/geocodingService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import TourneeMap from '../components/commandes/TourneeMap';
import { Button } from '../components/ui/button';

function adresseTexte(a) {
  return a ? `${a.quartier}, ${a.ville}, Cameroun` : null;
}

// Chaque commande de la tournée a un point différent selon MA phase actuelle
// dans cette course précise (cf. commandesService.suisJeActifPourPosition) :
// "à récupérer" (livreur_assigne, je suis le collecteur) → chez le vendeur ;
// "en route vers l'acheteur" (en_route_collecte même-ville, ou en_route_livraison
// inter-villes, je suis le livreur final) → chez l'acheteur. Les étapes d'agence
// (dépôt/récupération) n'ont pas d'adresse connue dans le schéma — pas d'arrêt
// carte pour elles, seulement une carte visible dans le détail de la commande.
function arretDe(c, uid) {
  if (c.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE && c.livreurCollecteId === uid) {
    return { id: c.id, titre: c.titreAnnonce || `Commande #${c.id.slice(0, 8).toUpperCase()}`, type: 'pickup', adresse: c.adressePickup, point: c.pickupGeocode };
  }
  const versAcheteur = (c.statut === STATUTS_COMMANDE.EN_ROUTE_COLLECTE && !c.interVilles) || c.statut === STATUTS_COMMANDE.EN_ROUTE_LIVRAISON;
  if (versAcheteur && c.livreurLivraisonId === uid) {
    return { id: c.id, titre: c.titreAnnonce || `Commande #${c.id.slice(0, 8).toUpperCase()}`, type: 'delivery', adresse: c.adresseLivraison, point: c.destinationGeocode };
  }
  return { id: c.id, titre: c.titreAnnonce || `Commande #${c.id.slice(0, 8).toUpperCase()}`, type: null, adresse: null, point: null };
}

export default function TourneePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [commandes, setCommandes] = useState(null);
  const [maPosition, setMaPosition] = useState(null);
  const geocodageEnCours = useRef(new Set());

  useEffect(() => {
    if (!user?.uid) return;
    getTourneeActuelle(user.uid).then(setCommandes).catch(() => setCommandes([]));
  }, [user?.uid]);

  // Position ponctuelle (pas de suivi continu ni d'écriture Firestore ici — juste
  // pour centrer la carte de synthèse) : la vraie position live partagée reste
  // gérée par CommandeDetailPage pendant une livraison active.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMaPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
    );
  }, []);

  // Géocode automatiquement les arrêts qui n'ont pas encore de point. Séquentiel
  // avec une pause courte : Nominatim (gratuit, sans clé) demande de ne pas
  // dépasser ~1 requête/seconde.
  useEffect(() => {
    if (!commandes || commandes.length === 0 || !user?.uid) return;
    let annule = false;
    (async () => {
      for (const c of commandes) {
        const arret = arretDe(c, user.uid);
        if (!arret.type || arret.point || !arret.adresse?.quartier || geocodageEnCours.current.has(c.id)) continue;
        geocodageEnCours.current.add(c.id);
        try {
          const { lat, lng } = await geocoderAdresse(arret.adresse.quartier, arret.adresse.ville);
          if (annule) return;
          if (arret.type === 'pickup') await updatePickupGeocode(c.id, lat, lng);
          else await updateDestinationGeocode(c.id, lat, lng);
          setCommandes((prev) => prev && prev.map((x) => (x.id === c.id
            ? { ...x, [arret.type === 'pickup' ? 'pickupGeocode' : 'destinationGeocode']: { lat, lng } }
            : x)));
          await new Promise((r) => setTimeout(r, 1100));
        } catch (e) {
          console.warn('Géocodage tournée échoué pour', c.id, e.message);
        } finally {
          geocodageEnCours.current.delete(c.id);
        }
      }
    })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandes?.length, user?.uid]);

  if (!commandes) return <Loader label="Chargement de votre tournée…" />;

  const arrets = commandes.map((c) => arretDe(c, user?.uid));
  const avecAdresse = arrets.filter((a) => adresseTexte(a.adresse));

  const ouvrirItineraire = () => {
    if (avecAdresse.length === 0) return;
    const adresses = avecAdresse.map((a) => encodeURIComponent(adresseTexte(a.adresse)));
    const destination = adresses[adresses.length - 1];
    const waypoints = adresses.slice(0, -1);
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    if (waypoints.length > 0) {
      url += `&waypoints=optimize:true|${waypoints.join('|')}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Ma tournée</h1>
        <p className="text-muted-foreground mt-1">Vos courses en cours, regroupées par zone.</p>
      </div>

      {commandes.length === 0 ? (
        <EmptyState title="Aucune course en cours" description="Vos courses assignées ou en route apparaîtront ici." icon={Package} />
      ) : (
        <>
          <TourneeMap arrets={arrets} maPosition={maPosition} onSelect={(id) => navigate(`/commandes/${id}`)} />

          {avecAdresse.length >= 2 && (
            <Button className="w-full" onClick={ouvrirItineraire}>
              <Navigation size={16} /> Ouvrir l'itinéraire optimisé ({avecAdresse.length} arrêts)
            </Button>
          )}

          <div className="space-y-2.5">
            {commandes.map((c) => {
              const arret = arretDe(c, user?.uid);
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/commandes/${c.id}`)}
                  className="glass-card-elevated p-4 w-full text-left flex items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                    <Package size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{c.titreAnnonce || `Commande #${c.id.slice(0, 8).toUpperCase()}`}</p>
                    {arret.adresse && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                        <MapPin size={12} className="flex-shrink-0" /> {arret.adresse.quartier}, {arret.adresse.ville}
                      </p>
                    )}
                    <div className="mt-1.5"><StatusBadge label={STATUT_LABELS[c.statut] || c.statut} tone="amber" /></div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

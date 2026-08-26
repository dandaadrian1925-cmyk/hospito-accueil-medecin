import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import { ICONE_MOI, ICONE_VENDEUR, ICONE_ACHETEUR, ICONE_DESTINATION } from '../../lib/mapIcons';

// Carte simple (pas de vrai guidage tour-par-tour, ni de service d'itinéraire) —
// affiche le point de destination géocodé (approximatif, précision quartier), la
// position actuelle du livreur, et — quand ils l'ont partagée — celle du vendeur
// (récupération) et de l'acheteur (livraison). Le bouton "Ouvrir dans Google Maps"
// reste le seul moyen d'obtenir un vrai guidage vocal/trafic en temps réel.
function AjusterVue({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [30, 30] });
    else if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
  }, [JSON.stringify(points)]);
  return null;
}

function InvalidateOnResize({ trigger }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [trigger]);
  return null;
}

export default function DestinationMap({ destination, position, vendeurPosition, acheteurPosition }) {
  const [pleinEcran, setPleinEcran] = useState(false);
  if (!destination) return null;

  const points = [destination, position, vendeurPosition, acheteurPosition].filter(Boolean);

  return (
    <div
      className={pleinEcran
        ? 'fixed inset-0 z-[9999] bg-black'
        : 'relative rounded-xl overflow-hidden border border-border'}
      style={pleinEcran ? undefined : { height: 220 }}
    >
      <button
        type="button"
        onClick={() => setPleinEcran((v) => !v)}
        className="absolute top-2.5 right-2.5 z-[1000] w-9 h-9 rounded-lg bg-card shadow-md flex items-center justify-center text-foreground hover:bg-muted"
        aria-label={pleinEcran ? 'Réduire la carte' : 'Agrandir la carte'}
      >
        {pleinEcran ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
      <MapContainer center={[destination.lat, destination.lng]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[destination.lat, destination.lng]} icon={ICONE_DESTINATION}>
          <Popup>Destination (approximative)</Popup>
        </Marker>
        {position && (
          <Marker position={[position.lat, position.lng]} icon={ICONE_MOI}>
            <Popup>Vous êtes ici</Popup>
          </Marker>
        )}
        {vendeurPosition && (
          <Marker position={[vendeurPosition.lat, vendeurPosition.lng]} icon={ICONE_VENDEUR}>
            <Popup>Le vendeur</Popup>
          </Marker>
        )}
        {acheteurPosition && (
          <Marker position={[acheteurPosition.lat, acheteurPosition.lng]} icon={ICONE_ACHETEUR}>
            <Popup>L'acheteur</Popup>
          </Marker>
        )}
        <AjusterVue points={points} />
        <InvalidateOnResize trigger={pleinEcran} />
      </MapContainer>
    </div>
  );
}

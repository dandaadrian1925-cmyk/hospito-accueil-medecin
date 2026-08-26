import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import { ICONE_MOI, creerIconeNumero } from '../../lib/mapIcons';

// Carte unique regroupant tous les arrêts de la tournée (au lieu d'ouvrir Google
// Maps en externe pour chaque commande) — mêmes tuiles OpenStreetMap et même
// style de marqueur que DestinationMap, pas de dépendance à une clé API Google.
function AjusterVue({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [40, 40] });
    else if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
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

export default function TourneeMap({ arrets, maPosition, onSelect }) {
  const [pleinEcran, setPleinEcran] = useState(false);
  const avecCoords = arrets.filter((a) => a.point);
  if (avecCoords.length === 0) return null;

  const points = [...avecCoords.map((a) => a.point), maPosition].filter(Boolean);
  const centre = points[0];

  return (
    <div
      className={pleinEcran ? 'fixed inset-0 z-[9999] bg-black' : 'relative rounded-xl overflow-hidden border border-border'}
      style={pleinEcran ? undefined : { height: 260 }}
    >
      <button
        type="button"
        onClick={() => setPleinEcran((v) => !v)}
        className="absolute top-2.5 right-2.5 z-[1000] w-9 h-9 rounded-lg bg-card shadow-md flex items-center justify-center text-foreground hover:bg-muted"
        aria-label={pleinEcran ? 'Réduire la carte' : 'Agrandir la carte'}
      >
        {pleinEcran ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
      <MapContainer center={[centre.lat, centre.lng]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {maPosition && (
          <Marker position={[maPosition.lat, maPosition.lng]} icon={ICONE_MOI}>
            <Popup>Vous êtes ici</Popup>
          </Marker>
        )}
        {avecCoords.map((a, i) => (
          <Marker key={a.id} position={[a.point.lat, a.point.lng]} icon={creerIconeNumero(i + 1, a.type)}>
            <Popup>
              <div style={{ fontSize: 13 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>{a.titre}</p>
                <p style={{ color: '#64748B', marginBottom: 6 }}>{a.type === 'pickup' ? 'Récupération chez le vendeur' : "Livraison chez l'acheteur"}</p>
                {onSelect && (
                  <button onClick={() => onSelect(a.id)} style={{ color: '#2451C4', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    Voir la commande →
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        <AjusterVue points={points} />
        <InvalidateOnResize trigger={pleinEcran} />
      </MapContainer>
    </div>
  );
}

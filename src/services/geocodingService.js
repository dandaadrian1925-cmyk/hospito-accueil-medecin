// Géocodage (quartier + ville → coordonnées approximatives) — utilisé pour
// afficher un point de destination sur la carte intégrée (cf.
// CommandeDetailPage). Précision limitée au quartier, jamais l'adresse exacte
// (aucune adresse précise n'est saisie dans l'app).
//
// #bug (retour utilisateur) : un appel DIRECT à Nominatim depuis le navigateur
// échouait systématiquement en production (CORS bloqué par Nominatim pour un
// usage navigateur, puis 429 Too Many Requests dès plusieurs livreurs/onglets
// en même temps — Nominatim n'est pas prévu pour ça). Passe désormais par
// l'Edge Function geocode-proxy (appel serveur-à-serveur : ni CORS, ni le
// même risque de blocage, avec sa propre limite de fréquence côté serveur).
import { auth } from '../firebase/config';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// #sécurité (variant analysis) : la clé anon Supabase est publique par
// conception — geocode-proxy exige désormais aussi un ID token Firebase (même
// principe que dynamic-processor) pour n'être appelable que par un compte
// MAKET réel, et limiter la fréquence par compte plutôt qu'un verrou global
// partagé par tous les appelants confondus.
export const geocoderAdresse = async (quartier, ville) => {
  if (!auth.currentUser) throw new Error('Vous devez être connecté');
  const firebaseIdToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/geocode-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'X-Firebase-Token': firebaseIdToken,
    },
    body: JSON.stringify({ quartier, ville }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Géocodage indisponible');
  return { lat: data.lat, lng: data.lng };
};

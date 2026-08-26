import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';

// #nouveau (demande utilisateur, "appels livreur-livreur pour l'inter-ville
// et client-livreur uniquement pour le moment") : le flux audio lui-même
// passe entièrement par Agora (SDK côté composant) — ce service ne gère que
// le jeton d'accès (agora-token, Edge Function) et le signal de présence
// d'appel sur la commande elle-même (appelEnCours), déjà inclus dans
// listenCommande — jamais un listener séparé nécessaire ici.
const AGORA_TOKEN_URL = 'https://cekiqtkdgjgawxxerjdf.supabase.co/functions/v1/agora-token';

export const getAgoraToken = async (commandeId, contexte) => {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(AGORA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'X-Firebase-Token': idToken
    },
    body: JSON.stringify({ commandeId, contexte })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Jeton d'appel indisponible");
  return data;
};

export const demarrerAppel = async (commandeId, contexte) => {
  await updateDoc(doc(db, 'commandes', commandeId), {
    appelEnCours: { contexte, callerId: auth.currentUser.uid, startedAt: serverTimestamp() }
  });
};

export const terminerAppel = async commandeId => {
  await updateDoc(doc(db, 'commandes', commandeId), { appelEnCours: null });
};

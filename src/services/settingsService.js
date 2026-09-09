import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Paramètres métier configurables — un document par établissement
// (`settings/{etablissementId}`), écrit uniquement par le sysadmin depuis
// hospito-admin (Paramètres métiers). Lecture seule ici.
// #nouveau (demande utilisateur, "enrichir les paramètres métiers") : les
// réglages précédemment définis ici sans jamais être lus dans le code
// applicatif (délai d'annulation, seuil de stock, délai de validation
// d'ordonnance, capacité de lit, délai de réaffectation) ont été retirés
// après audit — purs placeholders morts, sans effet réel.
const DEFAULTS = {
  delaiRappelRendezVousHeures: 24,
  dureeValiditeBilletJours: 14,
};

const cache = {};

export const getSettings = async (etablissementId) => {
  if (cache[etablissementId]) return cache[etablissementId];
  try {
    const snap = await getDoc(doc(db, 'settings', etablissementId));
    cache[etablissementId] = snap.exists() ? { ...DEFAULTS, ...snap.data() } : DEFAULTS;
  } catch {
    cache[etablissementId] = DEFAULTS;
  }
  return cache[etablissementId];
};

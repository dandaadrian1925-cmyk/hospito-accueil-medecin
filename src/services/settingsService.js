import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Paramètres métier configurables depuis maket-super-admin (settings/global,
// lecture publique) — retraitMinimum/Maximum pour le wallet (retraits
// uniquement, jamais de dépôt, cf. walletService.js) et fraisLivraisonMax pour
// plafonner le prix qu'un livreur peut proposer (cf. commandesService.js).
// DEFAULTS == repli si le document est absent/injoignable, même principe que
// maket-client/src/services/settingsService.js.
const DEFAULTS = {
  retraitMinimum: 1000,
  retraitMaximum: 500000,
  fraisLivraisonMax: 50000,
};

let cache = null;

export const getSettings = async () => {
  if (cache) return cache;
  try {
    const snap = await getDoc(doc(db, 'settings', 'global'));
    cache = snap.exists() ? { ...DEFAULTS, ...snap.data() } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache;
};

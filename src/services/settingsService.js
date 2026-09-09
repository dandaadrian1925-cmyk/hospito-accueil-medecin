import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Paramètres métier configurables — un document par établissement
// (`settings/{etablissementId}`), écrit uniquement par le sysadmin depuis
// hospito-admin (Paramètres métiers). Lecture seule ici.
const DEFAULTS = {
  delaiRappelRendezVousHeures: 24,
  delaiAnnulationRendezVousHeures: 2,
  seuilAlerteStockPourcentage: 20,
  delaiValidationPrescriptionHeures: 4,
  capaciteLitParDefaut: 1,
  delaiInactiviteReassignationHeures: 72,
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

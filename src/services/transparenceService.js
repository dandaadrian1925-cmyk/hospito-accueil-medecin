import {
  collection, doc, getDoc, setDoc, query, where, orderBy, limit, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Attente & transparence (Phase 5) — temps d'attente moyen aux urgences,
// calculé à partir des cas déjà pris en charge (heurePriseEnCharge -
// heureArrivee), sur un échantillon récent. Recalculé à la demande par
// l'accueil (aucune tâche planifiée dans ce projet, cf. mémoire) — jamais
// une estimation à la main, toujours dérivée de données réelles.
const TAILLE_ECHANTILLON = 30;

export const getTransparenceAttente = async (etablissementId) => {
  const snap = await getDoc(doc(db, 'transparence_attente', etablissementId));
  return snap.exists() ? snap.data() : null;
};

export const recalculerTempsAttente = async (etablissementId, actor) => {
  const q = query(
    collection(db, 'urgences'),
    where('etablissementId', '==', etablissementId),
    orderBy('heureArrivee', 'desc'),
    limit(TAILLE_ECHANTILLON),
  );
  const snap = await getDocs(q);
  const delaisMinutes = snap.docs
    .map((d) => d.data())
    .filter((u) => u.heureArrivee?.toDate && u.heurePriseEnCharge?.toDate)
    .map((u) => (u.heurePriseEnCharge.toDate() - u.heureArrivee.toDate()) / 60000);

  const tempsAttenteMoyenMinutes = delaisMinutes.length
    ? Math.round(delaisMinutes.reduce((a, b) => a + b, 0) / delaisMinutes.length)
    : null;

  await setDoc(doc(db, 'transparence_attente', etablissementId), {
    tempsAttenteMoyenMinutes, nombreEchantillon: delaisMinutes.length,
    calculeAt: serverTimestamp(), calculePar: actor.uid,
  });
  await logAction({ actor, etablissementId, action: 'transparence.recalculer', targetType: 'transparence_attente', targetId: etablissementId, details: { tempsAttenteMoyenMinutes } });
  return { tempsAttenteMoyenMinutes, nombreEchantillon: delaisMinutes.length };
};

import {
  collection, doc, getDoc, setDoc, query, where, orderBy, limit, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Attente & transparence (Phase 5) — temps d'attente moyen EN CONSULTATION
// (arrivée au guichet -> pris en charge par le médecin), calculé à partir des
// billets de session déjà consultés, sur un échantillon récent. Recalculé à
// la demande par l'accueil (aucune tâche planifiée dans ce projet, cf.
// mémoire) — jamais une estimation à la main, toujours dérivée de données
// réelles.
// #corrigé (audit) : calculait auparavant sur la collection `urgences`,
// retirée de ce projet (module Urgences supprimé) — plus jamais alimentée,
// donc `tempsAttenteMoyenMinutes` restait bloqué à `null` pour tout le monde.
// `billets_session` (createdAt -> consulteAt) est la donnée réelle et vivante
// équivalente pour ce système : le temps entre l'arrivée au guichet et la
// prise en charge par le médecin.
const TAILLE_ECHANTILLON = 30;

export const getTransparenceAttente = async (etablissementId) => {
  const snap = await getDoc(doc(db, 'transparence_attente', etablissementId));
  return snap.exists() ? snap.data() : null;
};

export const recalculerTempsAttente = async (etablissementId, actor) => {
  const q = query(
    collection(db, 'billets_session'),
    where('etablissementId', '==', etablissementId),
    where('statut', '==', 'consulte'),
    orderBy('consulteAt', 'desc'),
    limit(TAILLE_ECHANTILLON),
  );
  const snap = await getDocs(q);
  const delaisMinutes = snap.docs
    .map((d) => d.data())
    .filter((b) => b.createdAt?.toDate && b.consulteAt?.toDate)
    .map((b) => (b.consulteAt.toDate() - b.createdAt.toDate()) / 60000);

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

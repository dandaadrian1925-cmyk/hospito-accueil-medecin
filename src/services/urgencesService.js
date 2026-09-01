import {
  collection, doc, addDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Urgences (§4.10) — triage selon échelle de gravité et file d'attente
// dynamique, scopé par établissement. Échelle de triage simplifiée : 1 =
// vital (priorité immédiate) à 5 = à différer.
export const STATUTS_URGENCE = ['en_attente', 'en_consultation', 'traite', 'transfere'];
export const NIVEAUX_TRIAGE = [1, 2, 3, 4, 5];

// File d'attente en temps réel, triée par gravité d'abord puis ordre
// d'arrivée — tri classique de triage, pas juste chronologique comme les
// autres listes. Écoute live (pas de pagination) : le volume d'urgences
// simultanées reste faible, et "dynamique" (§4.10) appelle du temps réel.
export const listenUrgences = (etablissementId, callback) => {
  const q = query(
    collection(db, 'urgences'), where('etablissementId', '==', etablissementId),
    orderBy('niveauTriage', 'asc'), orderBy('heureArrivee', 'asc'),
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const enregistrerArrivee = async ({ patientId, patientNom, niveauTriage, motif }, etablissementId, actor) => {
  const ref = await addDoc(collection(db, 'urgences'), {
    etablissementId, patientId, patientNom, niveauTriage: Number(niveauTriage),
    motif: motif?.trim() || null, statut: 'en_attente',
    heureArrivee: serverTimestamp(), heurePriseEnCharge: null, heureSortie: null, medecinId: null,
    createdBy: actor?.uid || null,
  });
  await logAction({ actor, etablissementId, action: 'urgence.enregistrer_arrivee', targetType: 'urgence', targetId: ref.id, details: { patientId, niveauTriage } });
  return ref.id;
};

export const prendreEnCharge = async (urgenceId, etablissementId, actor) => {
  await updateDoc(doc(db, 'urgences', urgenceId), {
    statut: 'en_consultation', heurePriseEnCharge: serverTimestamp(), medecinId: actor?.uid || null,
  });
  await logAction({ actor, etablissementId, action: 'urgence.prendre_en_charge', targetType: 'urgence', targetId: urgenceId });
};

export const cloturer = async (urgenceId, statut, etablissementId, actor) => {
  if (!['traite', 'transfere'].includes(statut)) throw new Error('STATUT_INVALIDE');
  await updateDoc(doc(db, 'urgences', urgenceId), { statut, heureSortie: serverTimestamp() });
  await logAction({ actor, etablissementId, action: 'urgence.cloturer', targetType: 'urgence', targetId: urgenceId, details: { statut } });
};

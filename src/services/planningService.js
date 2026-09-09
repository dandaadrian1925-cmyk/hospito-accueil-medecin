import {
  collection, doc, addDoc, deleteDoc, getDocs, query, where, orderBy, onSnapshot, documentId, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Planning du personnel (Phase 2) — même collection/règles que hospito-admin
// (cf. planningService.js là-bas), mais géré ici directement par l'accueil de
// chaque spécialité : c'est lui qui connaît précisément quel médecin
// travaille quel jour, pas un administrateur central.
export const CRENEAUX = ['matin', 'apres-midi', 'nuit'];

export const listenPlanning = (etablissementId, dateDebut, dateFin, callback) => {
  const q = query(
    collection(db, 'plannings'),
    where('etablissementId', '==', etablissementId),
    where('date', '>=', dateDebut),
    where('date', '<=', dateFin),
    orderBy('date', 'asc'),
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const creerCreneau = async ({ etablissementId, personnelUid, personnelNom, serviceId, serviceNom, date, creneau }, actor) => {
  if (!CRENEAUX.includes(creneau)) throw new Error('CRENEAU_INVALIDE');
  const ref = await addDoc(collection(db, 'plannings'), {
    etablissementId, personnelUid, personnelNom, serviceId: serviceId || null, serviceNom: serviceNom || null,
    date, creneau, createdAt: serverTimestamp(), createdBy: actor.uid,
  });
  await logAction({ actor, etablissementId, action: 'planning.creer', targetType: 'planning', targetId: ref.id, details: { personnelUid, date, creneau } });
  return ref.id;
};

export const supprimerCreneau = async (planningId, etablissementId, actor) => {
  await deleteDoc(doc(db, 'plannings', planningId));
  await logAction({ actor, etablissementId, action: 'planning.supprimer', targetType: 'planning', targetId: planningId });
};

// Uniquement les médecins (contrairement à listerPersonnelActif côté
// hospito-admin qui liste tout le monde) — l'accueil planifie des médecins,
// pas son propre personnel de guichet.
export const listerMedecinsActifs = async (etablissementId) => {
  const snap = await getDocs(query(collection(db, 'affiliations'), where('etablissementId', '==', etablissementId), where('actif', '==', true)));
  const affiliations = snap.docs.map((d) => d.data()).filter((a) => a.role === 'medecin');
  const uids = [...new Set(affiliations.map((a) => a.userId))];
  const profils = {};
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    if (!chunk.length) continue;
    const usersSnap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
    usersSnap.docs.forEach((d) => { profils[d.id] = d.data(); });
  }
  return affiliations.map((a) => ({
    uid: a.userId, nom: profils[a.userId]?.displayName || a.userId,
    serviceId: a.serviceId || null, service: a.service || null,
  }));
};

// Lecture seule, pour proposer à la confirmation d'une demande de RDV les
// médecins réellement de garde plutôt que tout le personnel affilié.
export const creneauDepuisHeure = (heure) => (heure < 12 ? 'matin' : heure < 18 ? 'apres-midi' : 'nuit');

export const listerMedecinsDeGarde = async (etablissementId, date, creneau, serviceId) => {
  const snap = await getDocs(query(
    collection(db, 'plannings'),
    where('etablissementId', '==', etablissementId),
    where('date', '==', date),
    where('creneau', '==', creneau),
  ));
  const entries = snap.docs.map((d) => d.data());
  if (serviceId) {
    const memeService = entries.filter((e) => e.serviceId === serviceId);
    if (memeService.length) return new Set(memeService.map((e) => e.personnelUid));
  }
  return new Set(entries.map((e) => e.personnelUid));
};

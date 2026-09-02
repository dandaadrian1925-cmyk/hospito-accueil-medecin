import {
  collection, doc, updateDoc, query, where, orderBy, onSnapshot, getDocs, documentId, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Demandes de RDV soumises depuis l'app patient (hospito-patient) — distinctes
// des rendez_vous pris directement au guichet (rendezVousService.js), car
// liées à un compte patient réel (patientUid) plutôt qu'à une fiche
// `patients/{id}` interne. La confirmation se fait directement sur CE
// document (pas de duplication vers rendez_vous) : plus simple, et
// nécessaire pour la téléconsultation qui a besoin du patientUid d'origine.
export const listenDemandesEnAttente = (etablissementId, callback) => {
  const q = query(
    collection(db, 'demandes_rendez_vous'),
    where('etablissementId', '==', etablissementId),
    where('statut', '==', 'en_attente'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const confirmerDemande = async (demandeId, { medecinId, medecinNom, dateHeure }, etablissementId, actor) => {
  await updateDoc(doc(db, 'demandes_rendez_vous', demandeId), {
    statut: 'confirme',
    medecinId: medecinId || null,
    medecinNom: medecinNom || null,
    dateHeure: dateHeure ? Timestamp.fromDate(new Date(dateHeure)) : null,
  });
  await logAction({ actor, etablissementId, action: 'demande_rdv.confirmer', targetType: 'demande_rendez_vous', targetId: demandeId, details: { medecinId } });
};

export const refuserDemande = async (demandeId, etablissementId, actor) => {
  await updateDoc(doc(db, 'demandes_rendez_vous', demandeId), { statut: 'refuse' });
  await logAction({ actor, etablissementId, action: 'demande_rdv.refuser', targetType: 'demande_rendez_vous', targetId: demandeId });
};

// Même jointure affiliations+users que planningService (hospito-admin) —
// nécessaire pour assigner un médecin à une téléconsultation.
export const listerMedecins = async (etablissementId) => {
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
  return affiliations.map((a) => ({ uid: a.userId, nom: profils[a.userId]?.displayName || a.userId }));
};

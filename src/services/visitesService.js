import {
  collection, doc, addDoc, updateDoc, query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Visites (Phase 5) — un visiteur ne se déclare que pour un patient
// actuellement hospitalisé (admissions.statut == 'admis'). heureDepart ==
// null tant que la visite est en cours ; c'est ce champ qui définit "en cours".
export const listenVisitesEnCours = (etablissementId, callback) => {
  const q = query(collection(db, 'visites'), where('etablissementId', '==', etablissementId), where('heureDepart', '==', null));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const enregistrerArrivee = async ({ etablissementId, admissionId, patientNom, visiteurNom, lienParente }, actor) => {
  const ref = await addDoc(collection(db, 'visites'), {
    etablissementId, admissionId, patientNom, visiteurNom: visiteurNom.trim(), lienParente: lienParente?.trim() || null,
    heureArrivee: serverTimestamp(), heureDepart: null, createdBy: actor.uid,
  });
  await logAction({ actor, etablissementId, action: 'visite.arrivee', targetType: 'visite', targetId: ref.id, details: { admissionId, visiteurNom } });
  return ref.id;
};

export const enregistrerDepart = async (visiteId, etablissementId, actor) => {
  await updateDoc(doc(db, 'visites', visiteId), { heureDepart: serverTimestamp() });
  await logAction({ actor, etablissementId, action: 'visite.depart', targetType: 'visite', targetId: visiteId });
};

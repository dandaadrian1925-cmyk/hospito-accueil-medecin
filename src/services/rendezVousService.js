import {
  collection, doc, addDoc, updateDoc, query, where, orderBy, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Rendez-vous et consultations (§4.4) — scopés par établissement.
export const STATUTS_RDV = ['planifie', 'confirme', 'annule', 'termine'];

export const buildRendezVousQuery = (etablissementId) =>
  query(collection(db, 'rendez_vous'), where('etablissementId', '==', etablissementId), orderBy('dateHeure', 'asc'));

export const creerRendezVous = async ({ patientId, patientNom, serviceId, service, dateHeure, motif }, etablissementId, actor) => {
  const ref = await addDoc(collection(db, 'rendez_vous'), {
    etablissementId, patientId, patientNom, serviceId: serviceId || null, service: service?.trim() || null,
    dateHeure: Timestamp.fromDate(new Date(dateHeure)), motif: motif?.trim() || null,
    statut: 'planifie', createdAt: serverTimestamp(), createdBy: actor?.uid || null,
  });
  await logAction({ actor, etablissementId, action: 'rendezvous.creer', targetType: 'rendez_vous', targetId: ref.id, details: { patientId } });
  return ref.id;
};

export const changerStatutRendezVous = async (rdvId, statut, etablissementId, actor) => {
  if (!STATUTS_RDV.includes(statut)) throw new Error('STATUT_INVALIDE');
  await updateDoc(doc(db, 'rendez_vous', rdvId), { statut });
  await logAction({ actor, etablissementId, action: 'rendezvous.changer_statut', targetType: 'rendez_vous', targetId: rdvId, details: { statut } });
};

import {
  collection, doc, addDoc, updateDoc, query, orderBy, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Rendez-vous et consultations (§4.4) — prise au guichet, annulation, report.
export const STATUTS_RDV = ['planifie', 'confirme', 'annule', 'termine'];

export const buildRendezVousQuery = () =>
  query(collection(db, 'rendez_vous'), orderBy('dateHeure', 'asc'));

export const creerRendezVous = async ({ patientId, patientNom, service, dateHeure, motif }, actor) => {
  const ref = await addDoc(collection(db, 'rendez_vous'), {
    patientId, patientNom, service: service?.trim() || null,
    dateHeure: Timestamp.fromDate(new Date(dateHeure)), motif: motif?.trim() || null,
    statut: 'planifie', createdAt: serverTimestamp(), createdBy: actor?.uid || null,
  });
  await logAction({ actor, action: 'rendezvous.creer', targetType: 'rendez_vous', targetId: ref.id, details: { patientId } });
  return ref.id;
};

export const changerStatutRendezVous = async (rdvId, statut, actor) => {
  if (!STATUTS_RDV.includes(statut)) throw new Error('STATUT_INVALIDE');
  await updateDoc(doc(db, 'rendez_vous', rdvId), { statut });
  await logAction({ actor, action: 'rendezvous.changer_statut', targetType: 'rendez_vous', targetId: rdvId, details: { statut } });
};

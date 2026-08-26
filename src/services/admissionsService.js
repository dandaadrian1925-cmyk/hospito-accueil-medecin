import {
  collection, doc, addDoc, updateDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Gestion administrative du patient — ADT (§4.2) : pré-admission, admission,
// sortie, transfert.
export const STATUTS_ADMISSION = ['pre_admission', 'admis', 'sorti', 'transfere'];

export const buildAdmissionsQuery = () =>
  query(collection(db, 'admissions'), orderBy('createdAt', 'desc'));

export const creerAdmission = async ({ patientId, patientNom, service, dateSortiePrevue }, actor) => {
  const ref = await addDoc(collection(db, 'admissions'), {
    patientId, patientNom, service: service?.trim() || null,
    statut: 'pre_admission', dateSortiePrevue: dateSortiePrevue || null, dateSortieReelle: null,
    createdAt: serverTimestamp(), createdBy: actor?.uid || null,
  });
  await logAction({ actor, action: 'admission.creer', targetType: 'admission', targetId: ref.id, details: { patientId } });
  return ref.id;
};

export const changerStatutAdmission = async (admissionId, statut, actor) => {
  if (!STATUTS_ADMISSION.includes(statut)) throw new Error('STATUT_INVALIDE');
  await updateDoc(doc(db, 'admissions', admissionId), {
    statut,
    ...(statut === 'sorti' ? { dateSortieReelle: serverTimestamp() } : {}),
  });
  await logAction({ actor, action: 'admission.changer_statut', targetType: 'admission', targetId: admissionId, details: { statut } });
};

import {
  collection, doc, addDoc, updateDoc, query, where, orderBy, getDocs, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// #corrigé (audit, "creerAdmission écrit statut:'pre_admission' et un champ
// `service` texte libre, jamais serviceId/serviceNom — la vraie règle
// Firestore (hospito-admin/firestore.rules) exige désormais statut=='admis'
// ET serviceId dans le périmètre servicesGeres de l'admin") : ce fichier
// datait de Phase 0/1, jamais mis à jour après la refonte ADT de
// hospito-admin (statuts réduits à 'admis'|'sorti', service référencé par
// id réel, historique des transferts en tableau plutôt qu'un statut à part).
// Chaque bouton "Nouvelle admission" de cette app échouait donc
// systématiquement en permission-denied. Reprend EXACTEMENT le même schéma
// que hospito-admin/src/services/admissionsService.js — même collection
// partagée, mêmes champs.
export const STATUTS_ADMISSION = ['admis', 'sorti'];

export const buildAdmissionsQuery = (etablissementId) =>
  query(collection(db, 'admissions'), where('etablissementId', '==', etablissementId), orderBy('createdAt', 'desc'));

export const admettre = async ({ patientId, patientNom, serviceId, serviceNom, motif }, etablissementId, actor) => {
  const dejaActive = await getDocs(query(
    collection(db, 'admissions'),
    where('etablissementId', '==', etablissementId),
    where('patientId', '==', patientId),
    where('statut', '==', 'admis'),
  ));
  if (!dejaActive.empty) throw new Error('ADMISSION_DEJA_ACTIVE');

  const ref = await addDoc(collection(db, 'admissions'), {
    etablissementId, patientId, patientNom, serviceId, serviceNom,
    motif: motif?.trim() || null,
    statut: 'admis',
    admisAt: serverTimestamp(), admisPar: actor.uid,
    sortieAt: null, sortiePar: null, compteRenduSortie: null,
    transferts: [],
    createdAt: serverTimestamp(),
  });
  await logAction({ actor, etablissementId, action: 'admission.creer', targetType: 'admission', targetId: ref.id, details: { serviceNom, motif } });
  return ref.id;
};

export const sortir = async (admissionId, compteRenduSortie, etablissementId, actor) => {
  await updateDoc(doc(db, 'admissions', admissionId), {
    statut: 'sorti', sortieAt: serverTimestamp(), sortiePar: actor.uid,
    compteRenduSortie: compteRenduSortie?.trim() || null,
  });
  await logAction({ actor, etablissementId, action: 'admission.changer_statut', targetType: 'admission', targetId: admissionId, details: { statut: 'sorti' } });
};

export const transferer = async (admissionId, { serviceId, serviceNom }, etablissementId, actor) => {
  await updateDoc(doc(db, 'admissions', admissionId), {
    serviceId, serviceNom,
    transferts: arrayUnion({ serviceId, serviceNom, at: new Date(), par: actor.uid }),
  });
  await logAction({ actor, etablissementId, action: 'admission.transferer', targetType: 'admission', targetId: admissionId, details: { serviceNom } });
};

// Patients actuellement hospitalisés — pour le sélecteur "Visites" (une
// visite ne se déclare que pour un patient réellement admis).
export const listerAdmissionsActives = async (etablissementId) => {
  const snap = await getDocs(query(collection(db, 'admissions'), where('etablissementId', '==', etablissementId), where('statut', '==', 'admis')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

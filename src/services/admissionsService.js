import {
  collection, doc, getDoc, addDoc, updateDoc, query, where, orderBy, getDocs, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';
import { creerNotification } from './notificationsService';

// #nouveau (demande utilisateur, "toutes les notifications soient
// fonctionnelles pour toutes les opérations") : admissions/sorties/
// transferts ne notifiaient jamais le patient, alors qu'un compte lié
// (patientUid) existe déjà sur la fiche pour la plupart des flux de ce
// projet — best-effort, jamais bloquant si la fiche n'a pas de compte lié.
const notifierPatientAdmission = async (patientId, { type, titre, message }) => {
  try {
    const patientUid = (await getDoc(doc(db, 'patients', patientId))).data()?.patientUid;
    if (patientUid) await creerNotification({ userId: patientUid, type, titre, message, link: '/mon-compte/dossier' });
  } catch { /* best-effort */ }
};

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
  notifierPatientAdmission(patientId, { type: 'admission', titre: 'Admission enregistrée', message: `Vous avez été admis en ${serviceNom}.` });
  return ref.id;
};

export const sortir = async (admissionId, compteRenduSortie, etablissementId, actor) => {
  const admission = (await getDoc(doc(db, 'admissions', admissionId))).data();
  await updateDoc(doc(db, 'admissions', admissionId), {
    statut: 'sorti', sortieAt: serverTimestamp(), sortiePar: actor.uid,
    compteRenduSortie: compteRenduSortie?.trim() || null,
  });
  await logAction({ actor, etablissementId, action: 'admission.changer_statut', targetType: 'admission', targetId: admissionId, details: { statut: 'sorti' } });
  if (admission?.patientId) notifierPatientAdmission(admission.patientId, { type: 'admission', titre: 'Sortie enregistrée', message: 'Votre sortie a été enregistrée.' });
};

export const transferer = async (admissionId, { serviceId, serviceNom }, etablissementId, actor) => {
  const admission = (await getDoc(doc(db, 'admissions', admissionId))).data();
  await updateDoc(doc(db, 'admissions', admissionId), {
    serviceId, serviceNom,
    transferts: arrayUnion({ serviceId, serviceNom, at: new Date(), par: actor.uid }),
  });
  await logAction({ actor, etablissementId, action: 'admission.transferer', targetType: 'admission', targetId: admissionId, details: { serviceNom } });
  if (admission?.patientId) notifierPatientAdmission(admission.patientId, { type: 'admission', titre: 'Transfert de service', message: `Vous avez été transféré vers ${serviceNom}.` });
};

// Patients actuellement hospitalisés — pour le sélecteur "Visites" (une
// visite ne se déclare que pour un patient réellement admis).
export const listerAdmissionsActives = async (etablissementId) => {
  const snap = await getDocs(query(collection(db, 'admissions'), where('etablissementId', '==', etablissementId), where('statut', '==', 'admis')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

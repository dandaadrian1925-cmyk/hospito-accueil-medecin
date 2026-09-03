import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// Lecture seule du planning (créé/géré côté hospito-admin) — cette app ne
// fait que le CONSULTER pour proposer, à la confirmation d'une demande de
// RDV, les médecins réellement de garde plutôt que tout le personnel
// affilié à l'établissement.
export const creneauDepuisHeure = (heure) => (heure < 12 ? 'matin' : heure < 18 ? 'apres-midi' : 'nuit');

// Renvoie l'ensemble des uid de garde pour ce jour/créneau. Si un service est
// précisé et que certains créneaux lui sont explicitement affectés, on ne
// garde que ceux-là ; sinon (aucune affectation par service ce créneau-là)
// on retombe sur tout le monde de garde, pour ne jamais renvoyer une liste
// vide simplement parce que le planning n'a pas été détaillé par service.
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

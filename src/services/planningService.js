import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, documentId, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// #refonte (demande utilisateur, "efface la logique de planning du
// personnel actuelle... l'accueil de chaque service entre les horaires de
// travail générales de tous les médecins de son service et ça s'affiche
// directement chez l'admin ainsi que pour tous les autres services") :
// remplace l'ancien roster daté (`plannings`, un doc par médecin × date ×
// créneau, redéfini semaine après semaine côté hospito-admin) par un
// planning hebdomadaire RÉCURRENT (`affiliations.horairesHabituels`), saisi
// ici même par l'accueil pour les médecins de SON PROPRE service (règle
// Firestore scopée service — un accueil ne peut pas toucher aux horaires
// d'un autre service).

// Uniquement les médecins (contrairement à listerPersonnel côté
// hospito-admin qui liste tout le monde) — TOUS services confondus, pour
// que l'accueil d'un service voie aussi les horaires des autres (lecture
// seule pour ceux qu'il ne gère pas, cf. HorairesMedecinsPage).
export const listerMedecinsActifs = async (etablissementId) => {
  const snap = await getDocs(query(collection(db, 'affiliations'), where('etablissementId', '==', etablissementId), where('actif', '==', true)));
  const affiliations = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.role === 'medecin');
  const uids = [...new Set(affiliations.map((a) => a.userId))];
  const profils = {};
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    if (!chunk.length) continue;
    const usersSnap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
    usersSnap.docs.forEach((d) => { profils[d.id] = d.data(); });
  }
  return affiliations.map((a) => ({
    id: a.id, uid: a.userId, nom: profils[a.userId]?.displayName || a.userId,
    serviceId: a.serviceId || null, service: a.service || null,
    horairesHabituels: a.horairesHabituels || null,
  }));
};

export const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const jourDeLaSemaineAujourdhui = () => JOURS_SEMAINE[new Date().getDay()];

// Même miroir public que hospito-admin/personnelService.js::syncMedecinPublic
// — nécessaire pour que la page Médecins du site patient (hospito-patient)
// reflète immédiatement une modification faite ici. Dupliqué plutôt que
// partagé entre apps (aucune app ne dépend du code source d'une autre dans
// ce projet).
const syncMedecinPublic = async (affiliationId, etablissementId) => {
  const snap = await getDoc(doc(db, 'affiliations', affiliationId));
  const a = snap.exists() ? snap.data() : null;
  if (!a || a.role !== 'medecin' || a.actif === false) {
    await deleteDoc(doc(db, 'medecins_publics', affiliationId)).catch(() => {});
    return;
  }
  const userSnap = await getDoc(doc(db, 'users', a.userId));
  await setDoc(doc(db, 'medecins_publics', affiliationId), {
    uid: a.userId, etablissementId, etablissementNom: a.etablissementNom || null,
    nom: userSnap.exists() ? userSnap.data().displayName || null : null,
    serviceId: a.serviceId || null, serviceNom: a.service || null,
    horairesHabituels: a.horairesHabituels || null,
    updatedAt: serverTimestamp(),
  });
};

// `horairesHabituels` UNIQUEMENT — la règle Firestore refuse tout autre
// champ ET exige que ce médecin soit du même service que l'accueil appelant.
export const enregistrerHorairesHabituels = async (affiliationId, horairesHabituels, etablissementId, actor) => {
  await updateDoc(doc(db, 'affiliations', affiliationId), { horairesHabituels });
  await syncMedecinPublic(affiliationId, etablissementId);
  await logAction({ actor, etablissementId, action: 'personnel.horaires_habituels', targetType: 'affiliation', targetId: affiliationId });
};

// Remplace listerMedecinsDeGarde (basé sur `plannings`) : un médecin est "de
// garde" à une date/heure donnée si son planning hebdomadaire récurrent
// couvre le jour de la semaine ET l'heure de `dateHeureStr`
// (datetime-local, ex. "2026-09-16T14:30").
export const estDeGardeSelonHoraires = (horairesHabituels, dateHeureStr) => {
  if (!dateHeureStr || !horairesHabituels?.length) return false;
  const d = new Date(dateHeureStr);
  const jour = JOURS_SEMAINE[d.getDay()];
  const minutes = d.getHours() * 60 + d.getMinutes();
  return horairesHabituels.some((h) => {
    if (h.jour !== jour) return false;
    const [hd, md] = (h.heureDebut || '0:0').split(':').map(Number);
    const [hf, mf] = (h.heureFin || '0:0').split(':').map(Number);
    return minutes >= (hd * 60 + md) && minutes < (hf * 60 + mf);
  });
};

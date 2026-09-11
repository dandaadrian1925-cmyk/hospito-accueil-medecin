import {
  collection, doc, updateDoc, query, where, orderBy, onSnapshot, getDocs, documentId, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';
import { trouverFicheParPatientUid } from './patientsService';
import { trouverBilletValidePourDate } from './billetsSessionService';

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

// #nouveau (demande utilisateur, "la confirmation n'est possible que s'il a
// un billet de consultation valide au jour du rendez-vous") : le patient
// doit déjà être passé une fois à l'accueil de CET établissement (fiche +
// billet), avec une fenêtre de validité couvrant la date du RDV — sinon la
// confirmation est refusée AVANT toute écriture (fail closed, jamais un RDV
// confirmé sans billet correspondant). #limité au présentiel : un patient en
// téléconsultation ne passe jamais physiquement à l'accueil et n'aura donc
// jamais de billet — exiger un billet pour cette voie casserait entièrement
// la téléconsultation, déjà en production.
export const confirmerDemande = async (demandeId, { medecinId, medecinNom, dateHeure, patientUid, type }, etablissementId, actor) => {
  if (!dateHeure) throw new Error('DATE_REQUISE');
  let billetId = null;
  if (type !== 'teleconsultation') {
    const fiche = patientUid ? await trouverFicheParPatientUid(patientUid, etablissementId) : null;
    if (!fiche) throw new Error('AUCUNE_FICHE_PATIENT');
    const billet = await trouverBilletValidePourDate(fiche.id, etablissementId, dateHeure);
    if (!billet) throw new Error('AUCUN_BILLET_VALIDE');
    billetId = billet.id;
    // #nouveau (demande utilisateur, "lorsqu'un rendez-vous est confirmé, il
    // entre directement dans la file d'attente du médecin en question") :
    // le billet trouvé ci-dessus existait déjà (condition de confirmation),
    // mais sans forcément porter le bon médecin ni l'heure de CE rendez-vous
    // — on le met à jour pour qu'il apparaisse dans la bonne file (cf.
    // billetsSessionService.js::listenFileAttente, hospito-medecin et
    // hospito-accueil-medecin, filtrées/triées sur ces mêmes champs).
    await updateDoc(doc(db, 'billets_session', billet.id), {
      medecinId: medecinId || null, medecinNom: medecinNom || null,
      dateHeure: Timestamp.fromDate(new Date(dateHeure)), demandeId,
    });
  }

  await updateDoc(doc(db, 'demandes_rendez_vous', demandeId), {
    statut: 'confirme',
    medecinId: medecinId || null,
    medecinNom: medecinNom || null,
    dateHeure: Timestamp.fromDate(new Date(dateHeure)),
  });
  await logAction({ actor, etablissementId, action: 'demande_rdv.confirmer', targetType: 'demande_rendez_vous', targetId: demandeId, details: { medecinId, billetId } });
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

// #nouveau (demande utilisateur, "billet de session lié à UN médecin
// précis") : même requête que listerMedecins, filtrée en plus sur le service
// (affiliations.serviceId, le service RÉEL du médecin). Utilisé par
// BilletsSessionPage pour proposer, à la création d'un billet, uniquement
// les médecins de CE service précis.
export const listerMedecinsDuService = async (etablissementId, serviceId) => {
  const snap = await getDocs(query(collection(db, 'affiliations'), where('etablissementId', '==', etablissementId), where('actif', '==', true)));
  const affiliations = snap.docs.map((d) => d.data()).filter((a) => a.role === 'medecin' && a.serviceId === serviceId);
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
    // #nouveau (remplace le filtrage "de garde" basé sur `plannings`,
    // supprimé) : nécessaire à RendezVousPage pour calculer, à la
    // confirmation d'une demande, qui est de garde à la date/heure choisie
    // via estDeGardeSelonHoraires (planningService.js).
    horairesHabituels: a.horairesHabituels || null,
  }));
};

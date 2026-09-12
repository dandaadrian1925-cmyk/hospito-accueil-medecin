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
// confirmé sans billet correspondant).
// #corrigé (demande utilisateur, "la téléconsultation exige aussi un billet
// de consultation valide à la date choisie, impérativement") : l'exemption
// initiale de la téléconsultation est retirée — même exigence, aucune
// différence de traitement selon le type de RDV.
export const confirmerDemande = async (demandeId, { medecinId, medecinNom, dateHeure, patientUid, patientFicheId }, etablissementId, actor) => {
  if (!dateHeure) throw new Error('DATE_REQUISE');
  // #nouveau (demande utilisateur, "la confirmation par l'accueil échoue
  // avec message d'erreur lorsque l'heure de rendez-vous est déjà passée si
  // c'est le jour courant") : refuse toute confirmation vers une date/heure
  // déjà écoulée — jamais un RDV "confirmé" pour un horaire déjà révolu.
  if (new Date(dateHeure).getTime() < Date.now()) throw new Error('DATE_PASSEE');
  // #nouveau (demande utilisateur, "un bébé ou une personne âgée sans
  // compte doit aussi pouvoir être pris en compte") : une demande faite
  // par un tuteur POUR UN PROCHE porte déjà l'id de sa fiche — jamais de
  // correspondance CNI à faire (le proche n'a ni CNI ni compte propre).
  const fiche = patientFicheId
    ? { id: patientFicheId }
    : (patientUid ? await trouverFicheParPatientUid(patientUid, etablissementId) : null);
  if (!fiche) throw new Error('AUCUNE_FICHE_PATIENT');
  const billet = await trouverBilletValidePourDate(fiche.id, etablissementId, dateHeure);
  if (!billet) throw new Error('AUCUN_BILLET_VALIDE');
  const billetId = billet.id;
  // #nouveau (demande utilisateur, "lorsqu'un rendez-vous est confirmé, il
  // entre directement dans la file d'attente du médecin en question") :
  // le billet trouvé ci-dessus existait déjà (condition de confirmation),
  // mais sans forcément porter le bon médecin ni l'heure de CE rendez-vous
  // — on le met à jour pour qu'il apparaisse dans la bonne file (cf.
  // billetsSessionService.js::listenFileAttente, hospito-medecin et
  // hospito-accueil-medecin, filtrées/triées sur ces mêmes champs). Un
  // billet trouvé encore 'pret' ou 'consulte' vient forcément d'UNE AUTRE
  // venue (sa fenêtre de validité couvre plusieurs jours) — efface les
  // anciens paramètres/traces de consultation, pour ne jamais laisser
  // croire que ce nouveau rendez-vous est déjà vu.
  // #corrigé (retour utilisateur, "la file d'attente reste vide même après
  // avoir confirmé un RDV aujourd'hui, comme si ça partait dans le vide") :
  // un correctif précédent, pensé pour le check-in physique au guichet
  // (créer un billet → prendre les paramètres → 'pret'), avait aussi fait
  // passer CE billet à 'arrive' au lieu de 'pret' — cassant la promesse
  // documentée ci-dessus ("entre DIRECTEMENT dans la file d'attente") pour
  // toute demande de RDV déjà payée. Une confirmation de RDV n'est PAS un
  // check-in physique à refaire : le paiement (ou l'absence de tarif) déjà
  // constaté au moment où ce billet a été validé suffit, il rentre donc
  // directement en 'pret'. Un billet encore 'a_payer' reste 'a_payer' — le
  // paiement doit toujours se faire avant l'entrée en file.
  const dejaPayeOuVu = billet.statut !== 'a_payer';
  await updateDoc(doc(db, 'billets_session', billet.id), {
    medecinId: medecinId || null, medecinNom: medecinNom || null,
    dateHeure: Timestamp.fromDate(new Date(dateHeure)), demandeId,
    ...(dejaPayeOuVu ? { statut: 'pret', parametres: null, parametresAt: null, consultePar: null, consulteAt: null } : {}),
  });

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

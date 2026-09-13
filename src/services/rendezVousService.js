import {
  collection, doc, addDoc, updateDoc, query, where, orderBy, onSnapshot, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';
import { trouverBilletValidePourDate } from './billetsSessionService';

// Rendez-vous et consultations (§4.4) — scopés par établissement.
// 'absent' : basculé automatiquement par la tâche planifiée serveur
// (hospito-taches-planifiees, action no_show_rdv) pour tout RDV dont l'heure
// est passée sans changement de statut — laissé aussi choisissable
// manuellement ici, un membre du personnel peut le constater avant le délai.
export const STATUTS_RDV = ['planifie', 'confirme', 'annule', 'termine', 'absent'];

export const buildRendezVousQuery = (etablissementId) =>
  query(collection(db, 'rendez_vous'), where('etablissementId', '==', etablissementId), orderBy('dateHeure', 'asc'));

// #nouveau (demande utilisateur, "reconstruit entièrement la File d'attente :
// elle doit contenir les patients ayant un rendez-vous confirmé par
// l'accueil") : écoute live (pas paginée, contrairement à buildRendezVousQuery
// + useFirestorePagination ci-dessus, pensé pour le tableau "Rendez-vous")
// de tous les RDV pris au guichet de l'établissement — FileAttentePage.jsx
// filtre ensuite par service et par période, comme pour les demandes en
// ligne confirmées (cf. demandesRendezVousService::listenDemandesConfirmees).
export const listenRendezVous = (etablissementId, callback) => {
  const q = query(collection(db, 'rendez_vous'), where('etablissementId', '==', etablissementId), orderBy('dateHeure', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const creerRendezVous = async ({ patientId, patientNom, serviceId, service, dateHeure, motif }, etablissementId, actor) => {
  const ref = await addDoc(collection(db, 'rendez_vous'), {
    etablissementId, patientId, patientNom, serviceId: serviceId || null, service: service?.trim() || null,
    dateHeure: Timestamp.fromDate(new Date(dateHeure)), motif: motif?.trim() || null,
    statut: 'planifie', createdAt: serverTimestamp(), createdBy: actor?.uid || null,
  });

  // #corrigé (retour utilisateur, "j'ai pris un rendez-vous aujourd'hui pour
  // ce patient mais il n'apparaît pas dans la file d'attente") : `rendez_vous`
  // (pris au guichet, ci-dessus) et `billets_session` (seule collection lue
  // par la File d'attente) étaient jusqu'ici totalement déconnectés — un RDV
  // guichet ne touchait jamais le billet du patient, même quand il en avait
  // déjà un valide. Même logique que confirmerDemande
  // (demandesRendezVousService.js) pour les demandes en ligne : si un billet
  // valide existe pour ce patient à cette date, on l'aligne sur ce RDV pour
  // qu'il entre dans la file — sinon le RDV reste créé tel quel (certains
  // services ne facturent pas de billet, ce n'est pas bloquant ici).
  try {
    const billet = await trouverBilletValidePourDate(patientId, etablissementId, dateHeure, serviceId);
    if (billet) {
      const dejaPayeOuVu = billet.statut !== 'a_payer';
      await updateDoc(doc(db, 'billets_session', billet.id), {
        dateHeure: Timestamp.fromDate(new Date(dateHeure)),
        ...(dejaPayeOuVu ? { statut: 'pret', parametres: null, parametresAt: null, consultePar: null, consulteAt: null } : {}),
      });
    }
  } catch {
    // Le RDV lui-même est déjà créé — l'échec de ce rattachement optionnel
    // ne doit pas faire croire à l'accueil que le RDV n'a pas été pris.
  }

  await logAction({ actor, etablissementId, action: 'rendezvous.creer', targetType: 'rendez_vous', targetId: ref.id, details: { patientId } });
  return ref.id;
};

export const changerStatutRendezVous = async (rdvId, statut, etablissementId, actor) => {
  if (!STATUTS_RDV.includes(statut)) throw new Error('STATUT_INVALIDE');
  await updateDoc(doc(db, 'rendez_vous', rdvId), { statut });
  await logAction({ actor, etablissementId, action: 'rendezvous.changer_statut', targetType: 'rendez_vous', targetId: rdvId, details: { statut } });
};

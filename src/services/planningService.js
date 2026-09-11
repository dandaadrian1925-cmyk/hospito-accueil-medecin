import {
  collection, getDocs, query, where, orderBy, onSnapshot, documentId,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// Planning du personnel — LECTURE SEULE côté accueil depuis la refonte de
// hospito-admin (vue hebdomadaire par service, plusieurs plages horaires/jour,
// synthèse IA). #retiré (conflit détecté, écriture croisée) : cette page
// écrivait auparavant directement ici (creerCreneau/supprimerCreneau, un
// créneau à la fois), alors que hospito-admin réécrit désormais TOUT le
// roster d'un jour en un coup (supprime puis recrée) — un accueil ajoutant un
// créneau juste avant qu'un admin enregistre sa propre journée le voyait
// silencieusement effacé. Un seul gestionnaire (hospito-admin), l'accueil
// garde uniquement la consultation, dont il a réellement besoin pour confirmer
// un rendez-vous en sachant qui est de garde.
export const CRENEAUX = ['matin', 'apres-midi', 'nuit'];

export const listenPlanning = (etablissementId, dateDebut, dateFin, callback) => {
  const q = query(
    collection(db, 'plannings'),
    where('etablissementId', '==', etablissementId),
    where('date', '>=', dateDebut),
    where('date', '<=', dateFin),
    orderBy('date', 'asc'),
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

// Uniquement les médecins (contrairement à listerPersonnelActif côté
// hospito-admin qui liste tout le monde) — l'accueil planifie des médecins,
// pas son propre personnel de guichet.
export const listerMedecinsActifs = async (etablissementId) => {
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
  return affiliations.map((a) => ({
    uid: a.userId, nom: profils[a.userId]?.displayName || a.userId,
    serviceId: a.serviceId || null, service: a.service || null,
    // #nouveau (demande utilisateur, "le tableau de bord de l'accueil doit
    // avoir le ou les médecins du service en poste le jour en question avec
    // les horaires de chacun... on va mettre des horaires par défaut
    // général du genre Dr X travaille tous les mercredis et vendredis de
    // 14h à 18h") : planning hebdomadaire RÉCURRENT saisi une fois par
    // l'admin (hospito-admin, PersonnelDetailPage) — [{jour, heureDebut,
    // heureFin}], distinct des `plannings` datés au jour le jour ci-dessus.
    horairesHabituels: a.horairesHabituels || null,
  }));
};

export const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const jourDeLaSemaineAujourdhui = () => JOURS_SEMAINE[new Date().getDay()];

// Lecture seule, pour proposer à la confirmation d'une demande de RDV les
// médecins réellement de garde plutôt que tout le personnel affilié.
export const creneauDepuisHeure = (heure) => (heure < 12 ? 'matin' : heure < 18 ? 'apres-midi' : 'nuit');

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

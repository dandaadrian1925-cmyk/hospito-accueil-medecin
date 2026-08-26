import {
  collection, doc, getDoc, getDocs,
  query, where, serverTimestamp, onSnapshot, updateDoc, increment, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { creerNotification } from './notificationsService';
import { getSettings } from './settingsService';
import { WALLET_TYPES } from './walletService';

// #livraison : réintégration du service de livraison (retiré plus tôt dans le
// projet), désormais 100% dématérialisé — plus d'assignation par un admin, plus
// de cash. Le livreur candidate lui-même sur une opportunité de sa ville et
// propose son propre prix, l'acheteur paie ces frais séparément, et le livreur
// est payé dans son solde MAKET réel (jamais cash), crédité automatiquement par
// finaliserCommandeSiExpiree côté maket-client — cette app ne crédite jamais
// elle-même, elle ne fait qu'observer le solde et le retirer (cf. walletService).
// Miroir exact des statuts/labels de maket-client/src/services/commandesService.js
// — les deux apps doivent rester en phase sur ce vocabulaire.
export const STATUTS_COMMANDE = {
  PAIEMENT_CONFIRME: 'paiement_confirme',
  EN_ATTENTE_VENDEUR: 'en_attente_vendeur',
  PREPARATION: 'preparation',
  EN_ATTENTE_LIVREUR: 'en_attente_livreur',
  PRIX_PROPOSE: 'prix_propose',
  LIVREUR_ASSIGNE: 'livreur_assigne',
  EN_ROUTE_COLLECTE: 'en_route_collecte',
  DEPOSE_AGENCE: 'depose_agence',
  RECUPERE_AGENCE: 'recupere_agence',
  EN_ROUTE_LIVRAISON: 'en_route_livraison',
  RETRACTATION: 'retractation',
  TERMINE: 'termine',
  LITIGE: 'litige',
  ANNULE: 'annule',
};

export const STATUT_LABELS = {
  paiement_confirme: 'Paiement confirmé',
  en_attente_vendeur: 'En attente vendeur',
  preparation: 'Article en préparation',
  en_attente_livreur: 'En attente d\'un second livreur',
  prix_propose: 'Prix proposé — en attente de l\'acheteur',
  livreur_assigne: 'À récupérer chez le vendeur',
  en_route_collecte: 'En route (collecte)',
  depose_agence: 'Déposé à l\'agence',
  recupere_agence: 'Récupéré à l\'agence',
  en_route_livraison: 'En route (livraison finale)',
  retractation: 'Remis — période de rétractation',
  termine: 'Terminé',
  litige: 'Litige ouvert',
  annule: 'Annulé',
};

// Statuts de trajet actif où le partage de position en direct est autorisé par
// firestore.rules (branche "Position live du livreur") — en dehors de cette
// liste, toute écriture sur livreurPosition est refusée côté serveur.
// #nouveau (demande utilisateur, "le livreur pourrait aussi demander la
// position du vendeur") : LIVREUR_ASSIGNE réintégré — jusqu'ici exclu (le
// suivi live ne démarrait qu'une fois l'article collecté), mais c'est
// pourtant le SEUL moment où la position du vendeur a un sens à demander
// (une fois collecté, le livreur a déjà l'article, plus aucune raison de
// solliciter le vendeur). Décision assumée, cf. firestore.rules (même liste
// étendue en miroir).
export const STATUTS_POSITION_ACTIVE = [
  STATUTS_COMMANDE.LIVREUR_ASSIGNE, STATUTS_COMMANDE.EN_ROUTE_COLLECTE, STATUTS_COMMANDE.DEPOSE_AGENCE,
  STATUTS_COMMANDE.RECUPERE_AGENCE, STATUTS_COMMANDE.EN_ROUTE_LIVRAISON,
];

// Statuts qui occupent la tournée du jour — LIVREUR_ASSIGNE fait désormais
// aussi partie de STATUTS_POSITION_ACTIVE (ci-dessus), donc identiques.
export const STATUTS_TOURNEE_ACTIVE = STATUTS_POSITION_ACTIVE;

// #nouveau (flux retour, litige gagné par l'acheteur) : vocabulaire séparé du
// `statut` principal (qui reste 'annule' pendant tout le retour) — cf.
// firestore.rules, branches R1-R4 de commandeUpdateAutorisee.
export const RETOUR_STATUT_LABELS = {
  paye: 'À récupérer chez l\'acheteur',
  collecte: 'Récupéré — en route vers le vendeur',
  termine: 'Retour terminé',
  echoue: 'Échec — acheteur non coopératif',
};

// Pendant une étape de trajet où PLUSIEURS livreurs peuvent être assignés
// (inter-villes), un seul des deux est réellement "en mouvement" à un instant
// donné — cf. transitionLivraisonValide côté firestore.rules : en_route_collecte
// est piloté par livreurCollecteId, les trois étapes suivantes par
// livreurLivraisonId (même-ville : les deux ids sont identiques, donc toujours vrai).
export function suisJeActifPourPosition(commande, uid) {
  if (!commande || !STATUTS_POSITION_ACTIVE.includes(commande.statut)) return false;
  if (commande.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE || commande.statut === STATUTS_COMMANDE.EN_ROUTE_COLLECTE) {
    return commande.livreurCollecteId === uid;
  }
  return commande.livreurLivraisonId === uid;
}

// Fusionne deux instantanés Firestore (une commande peut apparaître dans les
// deux si elle correspond aux deux requêtes) en dédupliquant par id — pattern
// répété plusieurs fois ci-dessous car aucune des relations livreur (ramassage/
// livraison finale, sur deux champs distincts) n'est exprimable en un seul
// `where` Firestore (pas d'OR entre deux champs différents dans ce SDK).
function fusionnerParId(...listesDeDocs) {
  const map = new Map();
  listesDeDocs.flat().forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  return Array.from(map.values());
}

// ─── Opportunités (#livraison) ──────────────────────────────────────────────
// Une commande en_attente_livreur est visible (cf. firestore.rules, allow read)
// par tout livreur vérifié de la ville de ramassage OU de la ville de livraison
// — mais un livreur donné ne peut agir que sur LE créneau qui correspond à sa
// ville (cf. allow update, branche "Candidature/progression livreur"). Comme la
// commande n'est jamais déjà "prise" pour le créneau visible tant qu'elle reste
// en_attente_livreur, il suffit de comparer les champs déjà présents dans le
// document pour savoir quel(s) rôle(s) sont réellement encore ouverts pour CE
// livreur — un rôle non éligible ne doit jamais être proposé dans l'UI (l'écriture
// échouerait de toute façon côté règles).
export function getRolesDisponibles(commande, ville, livreurId) {
  const roles = [];
  if (!ville || commande.modeRemise !== 'livraison' || commande.statut !== STATUTS_COMMANDE.EN_ATTENTE_LIVREUR) return roles;
  // #bug (corrigé, "un autre livreur vient de prendre le créneau" pourtant
  // faux) : un livreur déjà refusé par l'acheteur sur CETTE commande
  // (livreursRefuses, cf. firestore.rules) voyait quand même le bouton
  // "candidater" — sa tentative échouait en permission-denied, traduit à
  // tort en "créneau déjà pris" par OpportunitesPage, alors que la vraie
  // raison (refus antérieur) n'a rien à voir avec un autre livreur.
  if (livreurId && (commande.livreursRefuses || []).includes(livreurId)) return roles;
  if (!commande.livreurCollecteId && commande.adressePickup?.ville === ville) roles.push('collecte');
  if (commande.interVilles && commande.livreurCollecteId && !commande.livreurLivraisonId && commande.adresseLivraison?.ville === ville) {
    roles.push('livraison_finale');
  }
  return roles;
}

// Écoute en direct les opportunités de la ville du livreur — deux requêtes (ville
// de ramassage, ville de livraison) fusionnées, cf. fusionnerParId. `callback`
// n'est appelé qu'une fois les DEUX premiers résultats arrivés, pour ne jamais
// afficher une liste partielle (opportunités "livraison finale" manquantes) le
// temps que la seconde requête réponde.
export const listenOpportunites = (ville, callback) => {
  if (!ville) { callback([]); return () => {}; }
  let pickupDocs = null;
  let livraisonDocs = null;
  const emettre = () => {
    if (pickupDocs === null || livraisonDocs === null) return;
    callback(fusionnerParId(pickupDocs, livraisonDocs));
  };
  const qPickup = query(
    collection(db, 'commandes'),
    where('modeRemise', '==', 'livraison'),
    where('statut', '==', STATUTS_COMMANDE.EN_ATTENTE_LIVREUR),
    where('adressePickup.ville', '==', ville)
  );
  const qLivraison = query(
    collection(db, 'commandes'),
    where('modeRemise', '==', 'livraison'),
    where('statut', '==', STATUTS_COMMANDE.EN_ATTENTE_LIVREUR),
    where('adresseLivraison.ville', '==', ville)
  );
  const unsub1 = onSnapshot(qPickup, (snap) => { pickupDocs = snap.docs; emettre(); }, (e) => { console.error('Opportunités (ramassage) échouées :', e); pickupDocs = []; emettre(); });
  const unsub2 = onSnapshot(qLivraison, (snap) => { livraisonDocs = snap.docs; emettre(); }, (e) => { console.error('Opportunités (livraison finale) échouées :', e); livraisonDocs = []; emettre(); });
  return () => { unsub1(); unsub2(); };
};

// Candidature sur le créneau "ramassage" (cf. firestore.rules, première branche
// de la règle de candidature) — même-ville : cette seule écriture fixe le prix
// ET fait passer directement à prix_propose (un seul livreur fait tout).
// Inter-villes : le statut reste en_attente_livreur, en attente qu'un second
// livreur candidate sur le créneau "livraison finale" (cf. candidaterLivraisonFinale).
export const candidaterRamassage = async (commandeId, livreurId, fraisLivraison) => {
  if (!(fraisLivraison > 0)) throw new Error('MONTANT_INVALIDE');
  // ÉLEVÉE (variant analysis) : plafond réel désormais imposé côté règles
  // (settings/global.fraisLivraisonMax) — revérifié ici pour un message clair
  // plutôt qu'un refus de permission brut.
  const { fraisLivraisonMax } = await getSettings();
  if (fraisLivraison > fraisLivraisonMax) throw new Error('MONTANT_TROP_ELEVE');
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.statut !== STATUTS_COMMANDE.EN_ATTENTE_LIVREUR) throw new Error('STATUT_INVALIDE');
  if (commande.livreurCollecteId) throw new Error('DEJA_CANDIDATE');

  // #UX (variant analysis) : le check ci-dessus lit AVANT d'écrire — deux
  // livreurs candidatant à quelques millisecondes d'intervalle peuvent tous
  // les deux passer ce check (aucun des deux n'a encore vu l'écriture de
  // l'autre). Le SECOND `updateDoc` à atteindre le serveur est alors rejeté
  // par firestore.rules (elle revérifie livreurCollecteId==null côté serveur,
  // pas côté client) avec une erreur générique 'permission-denied' — sans
  // cette traduction, le perdant de la course voyait un message technique
  // incompréhensible au lieu de "un autre livreur vient de prendre ce créneau".
  //
  // #bug (corrigé, "un autre livreur vient de prendre le créneau" alors que
  // ce n'est pas le cas) : la règle qui protège cette écriture a PLUSIEURS
  // conditions (livreurCollecteId encore libre, mais AUSSI ville du profil ==
  // ville de ramassage, compte vérifié, pas dans livreursRefuses, prix sous
  // le plafond...) — un permission-denied peut donc venir de n'importe
  // laquelle, pas seulement d'un autre livreur plus rapide. Avant de conclure
  // "déjà pris", on relit la commande : si livreurCollecteId est TOUJOURS
  // vide, ce n'est PAS une course perdue — une autre condition a échoué.
  try {
    if (commande.interVilles) {
      // firestore.rules exige ICI un diff limité à exactement ces deux champs
      // (le statut ne bouge pas tant que le second créneau n'est pas rempli).
      await updateDoc(ref, { livreurCollecteId: livreurId, fraisLivraison });
      return;
    }

    const historique = commande.historiqueStatuts || [];
    historique.push({ statut: STATUTS_COMMANDE.PRIX_PROPOSE, date: new Date().toISOString() });
    await updateDoc(ref, {
      livreurCollecteId: livreurId, livreurLivraisonId: livreurId, fraisLivraison,
      statut: STATUTS_COMMANDE.PRIX_PROPOSE, historiqueStatuts: historique, updatedAt: serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 'permission-denied') {
      const apres = await getDoc(ref);
      if (apres.exists() && apres.data().livreurCollecteId) throw new Error('DEJA_CANDIDATE');
      throw new Error('CANDIDATURE_REFUSEE');
    }
    throw e;
  }

  if (commande.acheteurId) {
    await creerNotification({
      userId: commande.acheteurId, type: 'commande', titre: 'Un livreur a proposé un prix',
      message: `Un livreur propose ${fraisLivraison.toLocaleString('fr-FR')} XAF pour livrer "${commande.titreAnnonce || 'votre commande'}".`,
      link: `/commande/${commandeId}`,
    });
  }
};

// Candidature sur le créneau "livraison finale" — inter-villes uniquement,
// second livreur, seulement une fois le ramassage déjà attribué (cf.
// firestore.rules, seconde branche). Fait toujours passer à prix_propose : les
// deux créneaux sont alors remplis, l'acheteur peut payer.
export const candidaterLivraisonFinale = async (commandeId, livreurId, fraisLivraisonInterVilles) => {
  if (!(fraisLivraisonInterVilles > 0)) throw new Error('MONTANT_INVALIDE');
  const { fraisLivraisonMax } = await getSettings();
  if (fraisLivraisonInterVilles > fraisLivraisonMax) throw new Error('MONTANT_TROP_ELEVE');
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (!commande.interVilles) throw new Error('STATUT_INVALIDE');
  if (commande.statut !== STATUTS_COMMANDE.EN_ATTENTE_LIVREUR || !commande.livreurCollecteId) throw new Error('STATUT_INVALIDE');
  if (commande.livreurLivraisonId) throw new Error('DEJA_CANDIDATE');

  const historique = commande.historiqueStatuts || [];
  historique.push({ statut: STATUTS_COMMANDE.PRIX_PROPOSE, date: new Date().toISOString() });
  // Même correctif que candidaterRamassage : un permission-denied ici peut
  // venir d'une autre condition de la règle (ville, vérification,
  // livreursRefuses...) que la seule course perdue contre un autre livreur.
  try {
    await updateDoc(ref, {
      livreurLivraisonId: livreurId, fraisLivraisonInterVilles,
      statut: STATUTS_COMMANDE.PRIX_PROPOSE, historiqueStatuts: historique, updatedAt: serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 'permission-denied') {
      const apres = await getDoc(ref);
      if (apres.exists() && apres.data().livreurLivraisonId) throw new Error('DEJA_CANDIDATE');
      throw new Error('CANDIDATURE_REFUSEE');
    }
    throw e;
  }

  if (commande.acheteurId) {
    const total = (commande.fraisLivraison || 0) + fraisLivraisonInterVilles;
    await creerNotification({
      userId: commande.acheteurId, type: 'commande', titre: 'Frais de livraison finalisés',
      message: `Les deux livreurs ont fixé leur prix pour "${commande.titreAnnonce || 'votre commande'}" — total ${total.toLocaleString('fr-FR')} XAF.`,
      link: `/commande/${commandeId}`,
    });
  }
};

// #nouveau (demande utilisateur, "négocier les frais de livraison") :
// contre-offre du livreur, seulement à SON tour (negociationProposePar ==
// 'acheteur', jamais l'inverse) et sous 2 tours déjà utilisés. Non-inter-
// villes uniquement (même limite que la règle Firestore).
export const contrePropositionLivreur = async (commandeId, livreurId, montant) => {
  if (!(montant > 0)) throw new Error('MONTANT_INVALIDE');
  const { fraisLivraisonMax, negociationFraisLivraisonMaxTours } = await getSettings();
  if (montant > fraisLivraisonMax) throw new Error('MONTANT_TROP_ELEVE');
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.livreurCollecteId !== livreurId) throw new Error('COMMANDE_INVALIDE');
  if (commande.statut !== STATUTS_COMMANDE.PRIX_PROPOSE || commande.interVilles) throw new Error('STATUT_INVALIDE');
  if ((commande.negociationProposePar || 'livreur') !== 'acheteur') throw new Error('PAS_VOTRE_TOUR');
  if ((commande.negociationTour || 0) >= (negociationFraisLivraisonMaxTours ?? 2)) throw new Error('LIMITE_NEGOCIATION_ATTEINTE');
  await updateDoc(ref, {
    fraisLivraison: montant,
    negociationTour: (commande.negociationTour || 0) + 1,
    negociationProposePar: 'livreur',
    updatedAt: serverTimestamp(),
  });
};

// Accepte la contre-offre de l'acheteur SANS renégocier — débloque juste son
// paiement (aucun débit ici, payerFraisLivraison reste l'unique déclencheur
// financier, côté maket-client).
export const accepterContrePropositionAcheteur = async (commandeId, livreurId) => {
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.livreurCollecteId !== livreurId) throw new Error('COMMANDE_INVALIDE');
  if (commande.statut !== STATUTS_COMMANDE.PRIX_PROPOSE || commande.interVilles) throw new Error('STATUT_INVALIDE');
  if ((commande.negociationProposePar || 'livreur') !== 'acheteur') throw new Error('PAS_VOTRE_TOUR');
  await updateDoc(ref, { negociationProposePar: 'livreur', updatedAt: serverTimestamp() });
};

// ─── Mes livraisons (déjà assignées, un rôle ou l'autre) ────────────────────
export const listenMesLivraisons = (livreurId, callback) => {
  let collecteDocs = null;
  let livraisonDocs = null;
  const emettre = () => {
    if (collecteDocs === null || livraisonDocs === null) return;
    const rows = fusionnerParId(collecteDocs, livraisonDocs);
    rows.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    callback(rows);
  };
  const qCollecte = query(collection(db, 'commandes'), where('livreurCollecteId', '==', livreurId));
  const qLivraison = query(collection(db, 'commandes'), where('livreurLivraisonId', '==', livreurId));
  const unsub1 = onSnapshot(qCollecte, (snap) => { collecteDocs = snap.docs; emettre(); }, (e) => { console.error('Mes livraisons (collecte) échouées :', e); collecteDocs = []; emettre(); });
  const unsub2 = onSnapshot(qLivraison, (snap) => { livraisonDocs = snap.docs; emettre(); }, (e) => { console.error('Mes livraisons (livraison) échouées :', e); livraisonDocs = []; emettre(); });
  return () => { unsub1(); unsub2(); };
};

// Variante ponctuelle (pas d'écoute continue) — utilisée là où il ne s'agit que
// d'un contexte de fond (ex. ContactPage, résumé passé à l'assistant).
export const getMesLivraisons = async (livreurId) => {
  const [snapCollecte, snapLivraison] = await Promise.all([
    getDocs(query(collection(db, 'commandes'), where('livreurCollecteId', '==', livreurId))),
    getDocs(query(collection(db, 'commandes'), where('livreurLivraisonId', '==', livreurId))),
  ]);
  return fusionnerParId(snapCollecte.docs, snapLivraison.docs);
};

// Statistiques perso calculées à la volée (pas de champ delai/ETA dans le schéma
// commandes). Terminée = a atteint retractation ou termine — il n'existe plus de
// statut "livre" séparé (cf. transitionLivraisonValide, la saisie du code de
// remise finale fait à la fois foi de la remise et démarre la fenêtre de 24h).
export const getStatsPerso = async (livreurId) => {
  const rows = await getMesLivraisons(livreurId);
  let totalAssignees = 0, totalLivrees = 0, totalAnnulees = 0;
  const durees = [];
  rows.forEach((c) => {
    totalAssignees += 1;
    if (c.statut === STATUTS_COMMANDE.ANNULE) { totalAnnulees += 1; return; }
    if (![STATUTS_COMMANDE.RETRACTATION, STATUTS_COMMANDE.TERMINE].includes(c.statut)) return;
    totalLivrees += 1;
    const hist = c.historiqueStatuts || [];
    const debut = hist.find((h) => h.statut === STATUTS_COMMANDE.LIVREUR_ASSIGNE);
    const fin = hist.find((h) => h.statut === STATUTS_COMMANDE.RETRACTATION);
    if (debut && fin) {
      const minutes = (new Date(fin.date) - new Date(debut.date)) / 60000;
      if (minutes >= 0) durees.push(minutes);
    }
  });
  const dureeMoyenneMinutes = durees.length ? Math.round(durees.reduce((s, m) => s + m, 0) / durees.length) : null;
  const tauxAnnulation = totalAssignees > 0 ? Math.round((totalAnnulees / totalAssignees) * 1000) / 10 : 0;
  return { totalAssignees, totalLivrees, totalAnnulees, tauxAnnulation, dureeMoyenneMinutes };
};

// Livraisons actives (course en cours, du "à récupérer" jusqu'à la dernière
// étape de trajet) pour la tournée du jour.
export const getTourneeActuelle = async (livreurId) => {
  const [snapCollecte, snapLivraison] = await Promise.all([
    getDocs(query(collection(db, 'commandes'), where('livreurCollecteId', '==', livreurId), where('statut', 'in', STATUTS_TOURNEE_ACTIVE))),
    getDocs(query(collection(db, 'commandes'), where('livreurLivraisonId', '==', livreurId), where('statut', 'in', STATUTS_TOURNEE_ACTIVE))),
  ]);
  const commandes = fusionnerParId(snapCollecte.docs, snapLivraison.docs);
  commandes.sort((a, b) => {
    const va = a.adresseLivraison?.ville || '', vb = b.adresseLivraison?.ville || '';
    if (va !== vb) return va.localeCompare(vb);
    return (a.adresseLivraison?.quartier || '').localeCompare(b.adresseLivraison?.quartier || '');
  });
  return commandes;
};

// ─── Gains (#livraison) ──────────────────────────────────────────────────────
// Plus de calcul ad-hoc sur les commandes livrées : le grand livre `transactions`
// (type credit_livraison) est désormais la seule source de vérité, alimentée par
// finaliserCommandeSiExpiree côté maket-client (jamais par cette app).
export const getGains = async (livreurId) => {
  const q = query(
    collection(db, 'transactions'),
    where('userId', '==', livreurId),
    where('type', '==', 'credit_livraison')
  );
  const snap = await getDocs(q);
  const gains = snap.docs.map((d) => {
    const t = d.data();
    const date = t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : new Date().toISOString();
    return {
      id: d.id, commandeId: t.commandeId || null, montant: t.montant || 0,
      commissionMaket: t.commissionMaket || 0, description: t.description || '', date,
    };
  });
  gains.sort((a, b) => new Date(b.date) - new Date(a.date));
  const total = gains.reduce((s, g) => s + g.montant, 0);
  return { gains, total };
};

// ─── Détail d'une commande ───────────────────────────────────────────────────
export const getCommandeById = async (id) => {
  const snap = await getDoc(doc(db, 'commandes', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

// #confidentialité (variant analysis) : vrais noms acheteur/vendeur isolés dans
// leur propre sous-document (cf. firestore.rules, commandes/{id}/prive/identites)
// — jamais lisibles via commandes/{id} lui-même, réservé au(x) livreur(s) DÉJÀ
// assigné(s) (jamais un livreur qui ne fait que consulter les opportunités).
// Retourne null si le sous-document n'existe pas (main_propre) ou si les règles
// refusent la lecture (pas encore assigné) — jamais une erreur bloquante.
export const getIdentitesReelles = async (commandeId) => {
  try {
    const snap = await getDoc(doc(db, 'commandes', commandeId, 'prive', 'identites'));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
};

// Écoute en direct (page détail — un livreur peut garder cette page ouverte
// pendant toute une course). onError : sans lui, un accès refusé par les règles
// Firestore (commande qui n'est pas/plus assignée à ce livreur) faisait tourner
// la page indéfiniment sur le loader.
export const listenCommande = (id, callback, onError) => {
  return onSnapshot(doc(db, 'commandes', id), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
};

// ─── Progression du trajet ────────────────────────────────────────────────────
// Confirme la collecte chez le vendeur — remplace l'ancien bouton "J'ai récupéré
// l'article" (aveugle) : le livreur saisit le code à 4 chiffres que le vendeur
// lui donne en main propre, vérifié côté règles Firestore contre
// commandes/{id}/prive/collecte (lisible par le vendeur seul). livreur_assigne →
// en_route_collecte.
export const confirmerCollecte = async (commandeId, livreurId, codeSaisi) => {
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.livreurCollecteId !== livreurId) throw new Error('NON_ASSIGNE');
  if (commande.statut !== STATUTS_COMMANDE.LIVREUR_ASSIGNE) throw new Error('STATUT_INVALIDE');
  // #sécurité (corrigé, audit) : compteur dédié tentativesCodeCollecte —
  // partagé auparavant avec le code de remise, un livreur qui se trompait
  // ici épuisait le budget de la remise finale, cf. firestore.rules.
  if ((commande.tentativesCodeCollecte || 0) >= 8) throw new Error('TROP_TENTATIVES');
  await updateDoc(ref, { tentativesCodeCollecte: increment(1) });

  const historique = commande.historiqueStatuts || [];
  historique.push({ statut: STATUTS_COMMANDE.EN_ROUTE_COLLECTE, date: new Date().toISOString() });
  try {
    await updateDoc(ref, {
      statut: STATUTS_COMMANDE.EN_ROUTE_COLLECTE, historiqueStatuts: historique,
      codeCollecteSoumis: (codeSaisi || '').trim(), updatedAt: serverTimestamp(),
    });
  } catch (e) {
    // Les règles Firestore rejettent l'écriture si le code ne correspond pas —
    // message dédié pour l'UI plutôt qu'une erreur de permission générique.
    // #debug : la vraie cause (parfois autre chose qu'un mauvais code — statut
    // déjà changé entre-temps, mauvais livreur assigné...) était totalement
    // avalée, rendant ce genre de blocage impossible à diagnostiquer.
    console.error('confirmerCollecte a échoué :', e);
    throw new Error('CODE_INVALIDE');
  }

  if (commande.vendeurId) {
    await creerNotification({
      userId: commande.vendeurId, type: 'commande', titre: 'Article récupéré',
      message: `Le livreur a récupéré "${commande.titreAnnonce || 'votre article'}".`,
      link: `/commande/${commandeId}`,
    });
  }
};

// Confirme la remise finale à l'acheteur — même mécanisme que main_propre
// (code prive/remise, connu de l'acheteur seul), mais saisi par le livreur en
// charge de la livraison finale. Fait à la fois foi de la remise ET démarre la
// fenêtre de rétractation de 24h. Le statut de départ dépend du parcours :
// en_route_collecte (même-ville, un seul livreur) ou en_route_livraison
// (inter-villes, second livreur).
export const confirmerRemiseFinale = async (commandeId, livreurId, codeSaisi) => {
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  const statutAttendu = commande.interVilles ? STATUTS_COMMANDE.EN_ROUTE_LIVRAISON : STATUTS_COMMANDE.EN_ROUTE_COLLECTE;
  if (commande.livreurLivraisonId !== livreurId) throw new Error('NON_ASSIGNE');
  if (commande.statut !== statutAttendu) throw new Error('STATUT_INVALIDE');
  if ((commande.tentativesCode || 0) >= 8) throw new Error('TROP_TENTATIVES');
  await updateDoc(ref, { tentativesCode: increment(1) });

  const historique = commande.historiqueStatuts || [];
  historique.push({ statut: STATUTS_COMMANDE.RETRACTATION, date: new Date().toISOString() });
  try {
    await updateDoc(ref, {
      statut: STATUTS_COMMANDE.RETRACTATION, historiqueStatuts: historique,
      codeSoumis: (codeSaisi || '').trim(), updatedAt: serverTimestamp(),
      // retractationAt : horodatage SERVEUR exigé par firestore.rules (délai de
      // 24h avant que finaliserCommandeSiExpiree ne puisse créditer le vendeur/
      // livreur — cf. maket-client/commandesService.js).
      retractationAt: serverTimestamp(),
      livreurPosition: null,
    });
  } catch (e) {
    console.error('confirmerRemiseFinale a échoué :', e);
    throw new Error('CODE_INVALIDE');
  }

  if (commande.acheteurId) {
    await creerNotification({
      userId: commande.acheteurId, type: 'commande', titre: 'Livraison confirmée',
      message: `"${commande.titreAnnonce || 'Votre commande'}" vous a été remise. Vous avez 24h pour signaler un problème.`,
      link: `/commande/${commandeId}`,
    });
  }
};

// #nouveau (flux retour, litige gagné par l'acheteur) : le livreur assigné
// (retourLivreurId, cf. walletService.payerRetourLivraison côté maket-client)
// confirme avoir récupéré le colis chez l'acheteur, puis l'avoir remis au
// vendeur. Pas de code secret ici (contrairement à la collecte/remise
// normales) : le livreur, déjà identifié et vérifié, est seul juge sur place,
// comme pour toute remise en main propre hors app.
// #nouveau CRITIQUE (corrigé, gaps "le livreur n'est jamais payé pour le
// retour" + "l'acheteur est remboursé avant même d'avoir rendu l'article") :
// cette confirmation déclenche maintenant, dans LA MÊME transaction, le
// crédit du livreur pour CE trajet (le double payé par le vendeur sert
// entièrement à payer les deux trajets du livreur, jamais un remboursement
// caché — cf. firestore.rules livreurCreditRetourAutorise) ET le
// remboursement de l'acheteur (désormais subordonné à cette confirmation,
// jamais avant — cf. remboursementAcheteurRetourAutorise). Montant du trajet
// = mêmes frais qu'une livraison normale, mêmes commission/formule
// (settings.commissionLivraisonPercent).
export const confirmerRetourCollecte = async (commandeId, livreurId) => {
  const ref = doc(db, 'commandes', commandeId);
  const settings = await getSettings();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
    const commande = snap.data();
    if (commande.retourLivreurId !== livreurId) throw new Error('NON_ASSIGNE');
    if (commande.retourStatut !== 'paye') throw new Error('STATUT_INVALIDE');

    const montantLeg = (commande.fraisLivraison || 0) +
      (commande.interVilles ? (commande.fraisLivraisonInterVilles || 0) : 0);
    const commissionL = Math.round(montantLeg * ((settings.commissionLivraisonPercent ?? 0) / 100));
    const netLivreur = montantLeg - commissionL;
    if (netLivreur > 0) {
      tx.update(doc(db, 'users', livreurId), { solde: increment(netLivreur), commandeId });
      tx.set(doc(collection(db, 'transactions')), {
        userId: livreurId, type: WALLET_TYPES.LIVRAISON, montant: netLivreur, sourceWallet: 'principal',
        commandeId, commissionMaket: commissionL,
        description: `Retour livraison (trajet aller) commande #${commandeId.slice(0, 8).toUpperCase()}`,
        createdAt: serverTimestamp(),
      });
    }

    const fraisEventuels = (commande.fraisLivraison || 0) +
      (commande.interVilles ? (commande.fraisLivraisonInterVilles || 0) : 0);
    const montantArticle = commande.montantPreleve || 0;
    // #sécurité (corrigé, audit) : crédite le wallet RÉELLEMENT débité à
    // l'achat/au paiement des frais, jamais toujours solde — même raison
    // qu'annulerCommande (maket-client).
    const champWallet = code => code === 'parrainage' ? 'soldeParrainage' : (code === 'bonus' ? 'soldeBonus' : 'solde');
    const champArticle = champWallet(commande.sourceWalletAchat || 'principal');
    const champLivraison = champWallet(commande.sourceWalletLivraison || 'principal');
    const deltas = {};
    if (montantArticle > 0) deltas[champArticle] = (deltas[champArticle] || 0) + montantArticle;
    if (fraisEventuels > 0) deltas[champLivraison] = (deltas[champLivraison] || 0) + fraisEventuels;
    if ((montantArticle > 0 || fraisEventuels > 0) && commande.acheteurId) {
      tx.update(doc(db, 'users', commande.acheteurId), {
        ...Object.fromEntries(Object.entries(deltas).map(([champ, montant]) => [champ, increment(montant)])),
        commandeId
      });
      if (montantArticle > 0) {
        tx.set(doc(collection(db, 'transactions')), {
          userId: commande.acheteurId, type: WALLET_TYPES.REMBOURSEMENT, montant: montantArticle, sourceWallet: commande.sourceWalletAchat || 'principal',
          commandeId,
          description: `Remboursement litige commande #${commandeId.slice(0, 8).toUpperCase()} (article récupéré par le livreur)`,
          createdAt: serverTimestamp(),
        });
      }
      if (fraisEventuels > 0) {
        tx.set(doc(collection(db, 'transactions')), {
          userId: commande.acheteurId, type: WALLET_TYPES.REMBOURSEMENT, montant: fraisEventuels, sourceWallet: commande.sourceWalletLivraison || 'principal',
          commandeId,
          description: `Remboursement litige commande #${commandeId.slice(0, 8).toUpperCase()} (frais de livraison)`,
          createdAt: serverTimestamp(),
        });
      }
    }

    const historique = commande.retourHistorique || [];
    historique.push({ statut: 'collecte', date: new Date().toISOString() });
    tx.update(ref, {
      retourStatut: 'collecte', retourHistorique: historique, updatedAt: serverTimestamp(),
      rembourseCredite: true,
    });
  });

  const snap = await getDoc(ref);
  const commande = snap.data();
  if (commande?.vendeurId) {
    await creerNotification({
      userId: commande.vendeurId, type: 'commande', titre: 'Retour en cours',
      message: `Le livreur a récupéré "${commande.titreAnnonce || 'votre article'}" chez l'acheteur — il vous l'apporte.`,
      link: `/commande/${commandeId}`,
    });
  }
  if (commande?.acheteurId) {
    await creerNotification({
      userId: commande.acheteurId, type: 'commande', titre: 'Remboursement effectué',
      message: `Vous avez été remboursé pour "${commande.titreAnnonce || 'la commande'}" — merci d'avoir rendu l'article au livreur.`,
      link: `/commande/${commandeId}`,
    });
  }
};

// #nouveau (demande utilisateur, "que le vendeur confirme aussi qu'il a
// reçu sa commande") : codeSaisi désormais requis — même principe que
// confirmerRemiseFinale (parcours normal), le code n'est connu que du
// VENDEUR (prive/retour_remise), jamais lu par le livreur. tentativesCodeRetour
// (#sécurité, corrigé — audit, compteur dédié, partagé auparavant avec
// remise/collecte) incrémenté d'abord, dans une écriture SÉPARÉE toujours
// acceptée (sinon un code faux, qui fait échouer la transaction,
// n'enregistrerait jamais la tentative ratée).
export const confirmerRetourTermine = async (commandeId, livreurId, codeSaisi) => {
  const ref = doc(db, 'commandes', commandeId);
  const settings = await getSettings();
  const preSnap = await getDoc(ref);
  if (!preSnap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  if ((preSnap.data().tentativesCodeRetour || 0) >= 8) throw new Error('TROP_TENTATIVES');
  await updateDoc(ref, { tentativesCodeRetour: increment(1) });

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
      const commande = snap.data();
      if (commande.retourLivreurId !== livreurId) throw new Error('NON_ASSIGNE');
      if (commande.retourStatut !== 'collecte') throw new Error('STATUT_INVALIDE');

      // #nouveau (corrigé) : second trajet (remise au vendeur), même formule
      // que le premier — peut être un livreur DIFFÉRENT si l'admin a
      // réassigné entre-temps (chacun ne touche que ses propres trajets).
      const montantLeg = (commande.fraisLivraison || 0) +
        (commande.interVilles ? (commande.fraisLivraisonInterVilles || 0) : 0);
      const commissionL = Math.round(montantLeg * ((settings.commissionLivraisonPercent ?? 0) / 100));
      const netLivreur = montantLeg - commissionL;
      if (netLivreur > 0) {
        tx.update(doc(db, 'users', livreurId), { solde: increment(netLivreur), commandeId });
        tx.set(doc(collection(db, 'transactions')), {
          userId: livreurId, type: WALLET_TYPES.LIVRAISON, montant: netLivreur, sourceWallet: 'principal',
          commandeId, commissionMaket: commissionL,
          description: `Retour livraison (trajet retour) commande #${commandeId.slice(0, 8).toUpperCase()}`,
          createdAt: serverTimestamp(),
        });
      }

      const historique = commande.retourHistorique || [];
      historique.push({ statut: 'termine', date: new Date().toISOString() });
      tx.update(ref, {
        retourStatut: 'termine', retourHistorique: historique, updatedAt: serverTimestamp(),
        codeRetourSoumis: (codeSaisi || '').trim(),
      });
    });
  } catch (e) {
    // Erreurs applicatives réelles (jetées explicitement dans la transaction)
    // à laisser remonter telles quelles — seul un vrai rejet des règles
    // (code faux, permission-denied) doit devenir CODE_INVALIDE.
    if (['NON_ASSIGNE', 'STATUT_INVALIDE', 'COMMANDE_INTROUVABLE'].includes(e.message)) throw e;
    console.error('confirmerRetourTermine a échoué :', e);
    throw new Error('CODE_INVALIDE');
  }

  const snap = await getDoc(ref);
  const commande = snap.data();
  if (commande?.vendeurId) {
    await creerNotification({
      userId: commande.vendeurId, type: 'commande', titre: 'Retour terminé',
      message: `"${commande.titreAnnonce || 'Votre article'}" vous a été remis par le livreur.`,
      link: `/commande/${commandeId}`,
    });
  }
};

// #nouveau (gap "aucun état pour un acheteur qui refuse de coopérer, la
// tâche du livreur reste bloquée indéfiniment") : aucune conséquence
// financière (aucun trajet n'a été crédité, aucun remboursement déclenché —
// les deux ne peuvent désormais arriver QUE via confirmerRetourCollecte) —
// un admin doit ensuite réassigner (reassignerLivreurRetour, maket-admin)
// pour relancer le flux depuis 'paye'.
export const signalerEchecRetour = async (commandeId, livreurId) => {
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.retourLivreurId !== livreurId) throw new Error('NON_ASSIGNE');
  if (commande.retourStatut !== 'paye') throw new Error('STATUT_INVALIDE');
  const historique = commande.retourHistorique || [];
  historique.push({ statut: 'echoue', date: new Date().toISOString() });
  await updateDoc(ref, { retourStatut: 'echoue', retourHistorique: historique, updatedAt: serverTimestamp() });
};

// Liste live (pré-assignée, pas de candidature) des retours à effectuer par ce
// livreur — mirroir de listenMesLivraisons, mais un seul champ d'assignation
// (retourLivreurId, jamais de split collecte/livraison-finale pour un retour).
export const listenRetoursAssignes = (livreurId, callback) => {
  if (!livreurId) { callback([]); return () => {}; }
  const q = query(
    collection(db, 'commandes'),
    where('retourLivreurId', '==', livreurId),
    where('retourStatut', 'in', ['paye', 'collecte'])
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    callback(rows);
  }, (e) => { console.error('Retours assignés échoués :', e); callback([]); });
};

// Inter-villes uniquement : le livreur de ramassage dépose le colis au guichet
// de l'agence de transport — pas de code (l'agence n'a pas de compte MAKET),
// une photo du reçu/numéro de suivi fait foi. en_route_collecte → depose_agence.
export const deposerAgence = async (commandeId, livreurId, preuveUrl) => {
  if (!preuveUrl) throw new Error('PREUVE_MANQUANTE');
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.livreurCollecteId !== livreurId) throw new Error('NON_ASSIGNE');
  if (!commande.interVilles || commande.statut !== STATUTS_COMMANDE.EN_ROUTE_COLLECTE) throw new Error('STATUT_INVALIDE');

  const historique = commande.historiqueStatuts || [];
  historique.push({ statut: STATUTS_COMMANDE.DEPOSE_AGENCE, date: new Date().toISOString() });
  await updateDoc(ref, {
    statut: STATUTS_COMMANDE.DEPOSE_AGENCE, historiqueStatuts: historique, updatedAt: serverTimestamp(),
    preuveAgenceDepotUrl: preuveUrl,
  });

  if (commande.livreurLivraisonId) {
    await creerNotification({
      userId: commande.livreurLivraisonId, type: 'commande', titre: 'Colis arrivé à l\'agence',
      message: `Le colis pour "${commande.titreAnnonce || 'une commande'}" est arrivé à l'agence — vous pouvez aller le récupérer.`,
      link: `/commandes/${commandeId}`,
    });
  }
};

// Inter-villes uniquement : le livreur de livraison finale récupère le colis au
// guichet, dans sa propre ville — même principe, photo de preuve.
// depose_agence → recupere_agence.
export const recupererAgence = async (commandeId, livreurId, preuveUrl) => {
  if (!preuveUrl) throw new Error('PREUVE_MANQUANTE');
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.livreurLivraisonId !== livreurId) throw new Error('NON_ASSIGNE');
  if (!commande.interVilles || commande.statut !== STATUTS_COMMANDE.DEPOSE_AGENCE) throw new Error('STATUT_INVALIDE');

  const historique = commande.historiqueStatuts || [];
  historique.push({ statut: STATUTS_COMMANDE.RECUPERE_AGENCE, date: new Date().toISOString() });
  await updateDoc(ref, {
    statut: STATUTS_COMMANDE.RECUPERE_AGENCE, historiqueStatuts: historique, updatedAt: serverTimestamp(),
    preuveAgenceRecuperationUrl: preuveUrl,
  });
};

// Inter-villes uniquement : le livreur de livraison finale prend la route vers
// l'acheteur, une fois le colis récupéré à l'agence. recupere_agence →
// en_route_livraison (pas de code/preuve ici, juste le départ).
export const demarrerLivraisonFinale = async (commandeId, livreurId) => {
  const ref = doc(db, 'commandes', commandeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('COMMANDE_INTROUVABLE');
  const commande = snap.data();
  if (commande.livreurLivraisonId !== livreurId) throw new Error('NON_ASSIGNE');
  if (!commande.interVilles || commande.statut !== STATUTS_COMMANDE.RECUPERE_AGENCE) throw new Error('STATUT_INVALIDE');

  const historique = commande.historiqueStatuts || [];
  historique.push({ statut: STATUTS_COMMANDE.EN_ROUTE_LIVRAISON, date: new Date().toISOString() });
  await updateDoc(ref, { statut: STATUTS_COMMANDE.EN_ROUTE_LIVRAISON, historiqueStatuts: historique, updatedAt: serverTimestamp() });

  if (commande.acheteurId) {
    await creerNotification({
      userId: commande.acheteurId, type: 'commande', titre: 'Votre livreur est en route',
      message: `"${commande.titreAnnonce || 'Votre commande'}" est en route pour la livraison finale.`,
      link: `/commande/${commandeId}`,
    });
  }
};

// ─── Position live / cartes (#suite maps) ───────────────────────────────────
// Écrit directement sur la commande (champ livreurPosition), déjà lisible par
// l'acheteur/vendeur/admin — cf. firestore.rules, statuts autorisés dans
// STATUTS_POSITION_ACTIVE ci-dessus. Pas de vérification de statut ici : appelé
// uniquement pendant un trajet actif côté UI (CommandeDetailPage), et de toute
// façon revérifié côté serveur.
export const updateLivreurPosition = async (commandeId, lat, lng) => {
  await updateDoc(doc(db, 'commandes', commandeId), {
    livreurPosition: { lat, lng, updatedAt: serverTimestamp() },
  });
};

export const clearLivreurPosition = async (commandeId) => {
  await updateDoc(doc(db, 'commandes', commandeId), { livreurPosition: null });
};

// Demande de position ponctuelle au vendeur (role='vendeur', trajet vers lui
// avant collecte) ou à l'acheteur (role='acheteur', trajet vers lui après
// collecte) — jamais les deux en même temps, cf. STATUTS_POSITION_ACTIVE.
export const demanderPosition = async (commandeId, role, targetUserId, titreAnnonce) => {
  await updateDoc(doc(db, 'commandes', commandeId), {
    demandePosition: { role, demandedAt: serverTimestamp() },
  });
  if (targetUserId) {
    await creerNotification({
      userId: targetUserId, type: 'commande', titre: 'Position demandée',
      message: `Le livreur souhaite votre position actualisée pour "${titreAnnonce || 'votre commande'}".`,
      link: `/commande/${commandeId}`,
    });
  }
};

// Géocodage de l'adresse de livraison — fait une seule fois par commande et mis
// en cache sur le document (jamais regéocodé).
export const updateDestinationGeocode = async (commandeId, lat, lng) => {
  await updateDoc(doc(db, 'commandes', commandeId), {
    destinationGeocode: { lat, lng, geocodedAt: serverTimestamp() },
  });
};

// Géocodage de l'adresse de ramassage (chez le vendeur).
export const updatePickupGeocode = async (commandeId, lat, lng) => {
  await updateDoc(doc(db, 'commandes', commandeId), {
    pickupGeocode: { lat, lng, geocodedAt: serverTimestamp() },
  });
};

// Écoute la position ponctuelle de l'acheteur (ou, historiquement, du vendeur) —
// cf. firestore.rules (commandes/{id}/positions/{role}).
export const listenPosition = (commandeId, role, callback) => {
  return onSnapshot(doc(db, 'commandes', commandeId, 'positions', role), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  }, () => callback(null)); // pas encore partagée / droits pas encore propagés — silencieux
};

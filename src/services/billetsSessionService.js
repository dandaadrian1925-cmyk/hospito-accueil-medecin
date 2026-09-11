import {
  collection, doc, getDoc, writeBatch, updateDoc, query, where, orderBy, onSnapshot, getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';
import { getSettings } from './settingsService';

// Billet de session — un par passage à l'accueil (§ parcours patient réel).
// Le "coupon" décrit par l'utilisateur EST la facture elle-même : si un tarif
// existe pour le service choisi, elle est créée dans le MÊME writeBatch que
// le billet, avec `billetSessionId` pour le lien — voir
// hospito-admin/firestore.rules (factures.create, nouvelle branche accueil).
// #corrigé (demande utilisateur, "on lui prend ses paramètres et dès que
// c'est enregistré c'est marqué prêt chez l'accueil et chez le médecin") :
// 'pret' (visible dans la file d'attente) n'est plus déclenché par le
// paiement — seule la SAISIE DES PARAMÈTRES (saisirParametres ci-dessous)
// fait passer un billet à 'pret'. 'arrive' = check-in fait (payé, ou aucun
// tarif pour ce service) mais paramètres pas encore pris pour CETTE venue.
export const STATUTS_BILLET = ['a_payer', 'arrive', 'pret', 'consulte'];

export const listenBilletsDuJour = (etablissementId, callback) => {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, 'billets_session'),
    where('etablissementId', '==', etablissementId),
    where('createdAt', '>=', Timestamp.fromDate(debut)),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

// #nouveau (demande utilisateur, "la sidebar de l'accueil médecin doit
// aussi avoir file d'attente... du jour en cours et en ordre des heures de
// rendez-vous") : contrairement à listenBilletsDuJour (créés aujourd'hui,
// triés par heure de CRÉATION), un billet réutilisé pour confirmer un RDV
// en ligne (cf. confirmerDemande, demandesRendezVousService.js) peut avoir
// été créé un autre jour — sa vraie "heure du jour" est celle du RDV
// (`dateHeure`) quand il y en a une, sinon sa création (accueil physique,
// sans RDV en ligne). Filtré/trié CLIENT (pas de nouvelle clause `where` ni
// d'index composite) sur cette heure effective.
const heureEffective = (b) => (b.dateHeure?.toDate?.() || b.createdAt?.toDate?.() || null);
const estAujourdhui = (date) => {
  if (!date) return false;
  const auj = new Date();
  return date.getFullYear() === auj.getFullYear() && date.getMonth() === auj.getMonth() && date.getDate() === auj.getDate();
};

export const listenFileAttente = (etablissementId, serviceId, callback) => {
  const q = query(
    collection(db, 'billets_session'),
    where('etablissementId', '==', etablissementId),
    where('statut', '==', 'pret'),
    where('serviceId', '==', serviceId),
  );
  return onSnapshot(q, (snap) => callback(
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => estAujourdhui(heureEffective(b)))
      .sort((a, b) => heureEffective(a) - heureEffective(b)),
  ));
};

// #évolué (demande utilisateur, "durée de validité d'un billet configurable
// par le sysadmin dans les paramètres métiers, 14 jours par défaut") : un
// billet reste actif — bloquant la création d'un second pour ce même
// patient — pendant `dureeValiditeBilletJours` (settings/{etablissementId},
// Paramètres métiers), pas seulement jusqu'à minuit comme avant, ou dès
// qu'il passe à 'consulte'. Le nom de la fonction ("DuJour") reste pour ne
// pas casser les appelants existants, mais la fenêtre réelle est désormais
// paramétrable.
export const trouverBilletActifDuJour = async (patientId, etablissementId) => {
  const { dureeValiditeBilletJours } = await getSettings(etablissementId);
  const seuil = new Date(Date.now() - dureeValiditeBilletJours * 24 * 3600 * 1000);
  const snap = await getDocs(query(
    collection(db, 'billets_session'),
    where('etablissementId', '==', etablissementId),
    where('patientId', '==', patientId),
    where('createdAt', '>=', Timestamp.fromDate(seuil)),
  ));
  const actif = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((b) => b.statut !== 'consulte');
  return actif || null;
};

// #nouveau (demande utilisateur, "la confirmation n'est possible que s'il a
// un billet de consultation valide au jour du rendez-vous") : même fenêtre
// de validité que trouverBilletActifDuJour (dureeValiditeBilletJours depuis
// la création du billet), mais évaluée à une date CIBLE (celle du RDV,
// potentiellement dans le futur) plutôt qu'à "maintenant". Le statut
// 'consulte' n'invalide PAS le billet ici : "déjà vu" ne veut pas dire "n'a
// jamais eu de billet", seule la fenêtre de date compte pour cette
// vérification précise.
export const trouverBilletValidePourDate = async (patientId, etablissementId, dateCible) => {
  const { dureeValiditeBilletJours } = await getSettings(etablissementId);
  const snap = await getDocs(query(
    collection(db, 'billets_session'),
    where('etablissementId', '==', etablissementId),
    where('patientId', '==', patientId),
  ));
  const cibleMs = new Date(dateCible).getTime();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((b) => {
      const creeMs = b.createdAt?.toDate?.()?.getTime();
      if (!creeMs) return false;
      const expireMs = creeMs + dureeValiditeBilletJours * 24 * 3600 * 1000;
      return cibleMs >= creeMs && cibleMs <= expireMs;
    }) || null;
};

// `medecinId`/`medecinNom` optionnels (demande utilisateur, "file d'attente
// liée à UN médecin précis") : absent = comportement historique, visible par
// tout le service (cf. hospito-medecin, listenFileAttente).
export const creerBillet = async ({ patientId, patientNom, serviceId, serviceNom, medecinId, medecinNom }, etablissementId, actor) => {
  const dejaActif = await trouverBilletActifDuJour(patientId, etablissementId);
  if (dejaActif) throw new Error('BILLET_NON_EXPIRE');

  const tarifSnap = await getDocs(query(
    collection(db, 'tarifs_consultation'),
    where('etablissementId', '==', etablissementId), where('serviceId', '==', serviceId),
  ));
  const tarif = tarifSnap.empty ? null : tarifSnap.docs[0].data();

  const billetRef = doc(collection(db, 'billets_session'));
  const batch = writeBatch(db);
  batch.set(billetRef, {
    etablissementId, patientId, patientNom, serviceId, serviceNom,
    medecinId: medecinId || null, medecinNom: medecinNom || null,
    statut: tarif ? 'a_payer' : 'arrive',
    factureId: null, parametres: null, parametresAt: null,
    creePar: actor?.uid || null, consultePar: null, consulteAt: null,
    createdAt: serverTimestamp(),
  });

  if (tarif) {
    const factureRef = doc(collection(db, 'factures'));
    batch.set(factureRef, {
      etablissementId, patientUid: null, patientNom,
      // #nouveau (demande utilisateur, "Facturation filtrée par service géré") :
      // serviceId/serviceNom déjà disponibles ici (paramètres de cette
      // fonction), simplement jamais écrits sur la facture jusqu'ici.
      serviceId, serviceNom,
      libelle: `Consultation — ${serviceNom}`, montant: tarif.montant,
      statut: 'en_attente', billetSessionId: billetRef.id,
      creePar: actor?.uid || null, createdAt: serverTimestamp(),
    });
    batch.update(billetRef, { factureId: factureRef.id });
  }

  await batch.commit();
  await logAction({
    actor, etablissementId, action: 'billet_session.creer', targetType: 'billet_session', targetId: billetRef.id,
    details: { serviceNom, aPayer: !!tarif },
  });
  return { billetId: billetRef.id, statut: tarif ? 'a_payer' : 'arrive' };
};

// #corrigé (demande utilisateur, "dès que c'est enregistré [les
// paramètres] c'est marqué prêt") : c'est désormais CETTE fonction, pas le
// paiement, qui fait passer le billet à 'pret' — sauf s'il est déjà
// 'consulte' (le médecin a déjà vu ce patient pour cette venue, rouvrir les
// paramètres ne doit pas le remettre dans la file d'attente).
export const saisirParametres = async (billetId, parametres, etablissementId, actor) => {
  const snap = await getDoc(doc(db, 'billets_session', billetId));
  const dejaConsulte = snap.exists() && snap.data().statut === 'consulte';
  await updateDoc(doc(db, 'billets_session', billetId), {
    parametres, parametresAt: serverTimestamp(),
    ...(dejaConsulte ? {} : { statut: 'pret' }),
  });
  await logAction({ actor, etablissementId, action: 'billet_session.saisir_parametres', targetType: 'billet_session', targetId: billetId });
};

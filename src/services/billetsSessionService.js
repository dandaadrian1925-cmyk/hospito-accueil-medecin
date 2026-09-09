import {
  collection, doc, writeBatch, updateDoc, query, where, orderBy, onSnapshot, getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';
import { getSettings } from './settingsService';

// Billet de session — un par passage à l'accueil (§ parcours patient réel).
// Le "coupon" décrit par l'utilisateur EST la facture elle-même : si un tarif
// existe pour le service choisi, elle est créée dans le MÊME writeBatch que
// le billet, avec `billetSessionId` pour le lien — voir
// hospito-admin/firestore.rules (factures.create, nouvelle branche accueil).
// L'ABSENCE de tarif pour ce service = pas de barrière (billet 'pret' direct).
export const STATUTS_BILLET = ['a_payer', 'pret', 'consulte'];

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
    statut: tarif ? 'a_payer' : 'pret',
    factureId: null, parametres: null, parametresAt: null,
    creePar: actor?.uid || null, consultePar: null, consulteAt: null,
    createdAt: serverTimestamp(),
  });

  if (tarif) {
    const factureRef = doc(collection(db, 'factures'));
    batch.set(factureRef, {
      etablissementId, patientUid: null, patientNom,
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
  return { billetId: billetRef.id, statut: tarif ? 'a_payer' : 'pret' };
};

export const saisirParametres = async (billetId, parametres, etablissementId, actor) => {
  await updateDoc(doc(db, 'billets_session', billetId), { parametres, parametresAt: serverTimestamp() });
  await logAction({ actor, etablissementId, action: 'billet_session.saisir_parametres', targetType: 'billet_session', targetId: billetId });
};

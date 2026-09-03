import {
  collection, doc, query, where, orderBy, onSnapshot, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

// Paiement au guichet (§4.12/§4.15) — un patient sans accès à l'app (ou qui
// préfère payer en espèces sur place) règle sa facture directement à
// l'accueil. Constaté physiquement par le personnel, jamais via CamPay — cf.
// firestore.rules, qui distingue explicitement ce chemin (modePaiement
// 'especes') de la confirmation serveur réservée aux paiements en ligne.
export const listenFacturesEnAttente = (etablissementId, callback) => {
  const q = query(
    collection(db, 'factures'),
    where('etablissementId', '==', etablissementId),
    where('statut', '==', 'en_attente'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const encaisserEnEspeces = async (factureId, etablissementId, actor) => {
  await updateDoc(doc(db, 'factures', factureId), {
    statut: 'payee',
    modePaiement: 'especes',
    payeePar: actor.uid,
    payeeAt: serverTimestamp(),
  });
  await logAction({ actor, etablissementId, action: 'facture.encaisser_especes', targetType: 'facture', targetId: factureId });
};

// Paiement Mobile Money fait HORS de l'app (le patient a payé par lui-même,
// sans passer par CamPay in-app) : l'accueil constate le paiement via une
// capture d'écran/reçu Mobile Money uploadée, cf. firestore.rules (factures
// allow update, branche modePaiement=='mobile_money_preuve').
export const encaisserAvecPreuve = async (factureId, preuveUrl, etablissementId, actor) => {
  await updateDoc(doc(db, 'factures', factureId), {
    statut: 'payee',
    modePaiement: 'mobile_money_preuve',
    preuveUrl,
    payeePar: actor.uid,
    payeeAt: serverTimestamp(),
  });
  await logAction({ actor, etablissementId, action: 'facture.encaisser_preuve', targetType: 'facture', targetId: factureId });
};

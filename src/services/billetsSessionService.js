import {
  collection, doc, writeBatch, updateDoc, query, where, orderBy, onSnapshot, getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAction } from './auditService';

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

export const creerBillet = async ({ patientId, patientNom, serviceId, serviceNom }, etablissementId, actor) => {
  const tarifSnap = await getDocs(query(
    collection(db, 'tarifs_consultation'),
    where('etablissementId', '==', etablissementId), where('serviceId', '==', serviceId),
  ));
  const tarif = tarifSnap.empty ? null : tarifSnap.docs[0].data();

  const billetRef = doc(collection(db, 'billets_session'));
  const batch = writeBatch(db);
  batch.set(billetRef, {
    etablissementId, patientId, patientNom, serviceId, serviceNom,
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

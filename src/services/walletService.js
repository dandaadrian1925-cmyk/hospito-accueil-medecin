import {
  doc, collection, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, runTransaction, increment, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { creerNotification } from './notificationsService';
import { getSettings } from './settingsService';

export const RETRAIT_MINIMUM = 1000;

// #livraison : le livreur n'a jamais besoin de déposer — son solde n'est
// alimenté que par credit_livraison (crédité automatiquement par
// finaliserCommandeSiExpiree côté maket-client, jamais par cette app). Cette
// app ne fait donc que lire le solde et initier des retraits, même flux que
// maket-client/src/services/walletService.js (même Edge Function
// dynamic-processor pour le versement réel, déclenché plus tard par un admin).
export const WALLET_TYPES = {
  RETRAIT: 'retrait',
  LIVRAISON: 'credit_livraison',
  // #nouveau (flux retour, litige gagné par l'acheteur) : même type que le
  // remboursement litige côté maket-admin/maket-client (déjà dans la liste
  // blanche de transactions/{id} create, firestore.rules) — écrit ici par
  // confirmerRetourCollecte quand le livreur confirme la collecte.
  REMBOURSEMENT: 'remboursement_litige',
};

export const getWallet = async (userId) => {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return { solde: 0 };
  return { solde: snap.data()?.solde || 0 };
};

// Écoute en direct le solde — se met à jour tout seul dès qu'une course est
// créditée, sans recharger la page.
export const listenWallet = (userId, callback) => {
  return onSnapshot(doc(db, 'users', userId), (snap) => {
    callback({ solde: snap.exists() ? (snap.data()?.solde || 0) : 0 });
  });
};

export const getTransactions = async (userId) => {
  const q = query(
    collection(db, 'transactions'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// #nouveau (demande utilisateur, "avant qu'un retrait ne soit possible,
// refaire le calcul pour voir si le solde est faux") : port fidèle de
// maket-client/src/services/walletService.js verifierEcartSoldePropre —
// ledger plus simple ici (pas de dépôt ni de solde de parrainage côté
// livreur, seulement credit_livraison et retrait). Compare le solde réel de
// L'UTILISATEUR CONNECTÉ à celui reconstruit depuis SES PROPRES transactions
// (lecture déjà autorisée), gèle son propre compte si écart — false → true
// uniquement (cf. firestore.rules), donc jamais dangereux.
export const verifierEcartSoldePropre = async (userId) => {
  const userSnap = await getDoc(doc(db, 'users', userId));
  if (!userSnap.exists() || userSnap.data().soldeSuspect) return;
  const txSnap = await getDocs(query(collection(db, 'transactions'), where('userId', '==', userId)));
  let attendu = 0;
  for (const t of txSnap.docs.map((d) => d.data())) {
    if (t.type === WALLET_TYPES.RETRAIT && t.statut === 'rejete') continue;
    attendu += t.montant || 0;
  }
  const soldeReel = userSnap.data().solde || 0;
  if (soldeReel !== attendu) {
    await updateDoc(doc(db, 'users', userId), { soldeSuspect: true }).catch(() => {});
  }
};

// ─── Retrait (vers Mobile Money) ──────────────────────────────────────────────
// Ne fait que débiter le solde et créer la demande "en_cours" — le versement
// réel via CamPay se déclenche plus tard, côté serveur, quand un admin approuve
// (cf. maket-admin walletService.js validerRetrait, Edge Function
// dynamic-processor action initier_versement) — même pattern exact que
// maket-client/src/services/walletService.js initierRetrait.
export const initierRetrait = async (userId, montant, phoneNumber, operateur) => {
  const { retraitMinimum, retraitMaximum } = await getSettings();
  if (montant < retraitMinimum)
    throw new Error(`Montant minimum : ${retraitMinimum} XAF`);
  if (retraitMaximum && montant > retraitMaximum)
    throw new Error(`Montant maximum par retrait : ${retraitMaximum} XAF`);
  await verifierEcartSoldePropre(userId);

  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', userId);
    const userSnap = await tx.get(userRef);
    // #sécurité (variant analysis) : absent ici jusqu'ici (contrairement à
    // maket-client) — un compte gelé pour écart de solde détecté pouvait
    // continuer à retirer normalement depuis cette app, rendant le gel sans
    // aucune valeur de sécurité réelle pour un compte livreur.
    if (userSnap.data()?.soldeSuspect) throw new Error('COMPTE_SUSPENDU_VERIFICATION');
    const solde = userSnap.data()?.solde || 0;
    if (solde < montant)
      throw new Error(`Solde insuffisant (${solde} XAF disponibles)`);

    tx.update(userRef, { solde: increment(-montant) });
    tx.set(doc(collection(db, 'transactions')), {
      userId, type: WALLET_TYPES.RETRAIT, montant: -montant, sourceWallet: 'principal',
      phoneNumber, operateur, statut: 'en_cours',
      description: `Retrait vers ${phoneNumber} (${operateur})`,
      createdAt: serverTimestamp(),
    });
  });

  await creerNotification({
    userId, type: 'retrait', titre: 'Demande de retrait envoyée',
    message: `Votre demande de retrait de ${montant.toLocaleString('fr-FR')} XAF vers ${phoneNumber} est en cours de traitement.`,
    link: '/wallet',
  });
};

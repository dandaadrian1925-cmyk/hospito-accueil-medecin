import {
  collection, addDoc, serverTimestamp, query, where, orderBy,
  onSnapshot, updateDoc, doc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { pousserNotification } from '../supabase/config';

// Notifie un client d'un événement qui le concerne (dépôt, retrait, annonce,
// commande, litige, CNI, support...). Best-effort : ne doit jamais faire échouer
// l'action métier principale si l'écriture de la notification échoue. Déclenche
// aussi une notification push (best-effort également).
export const creerNotification = async ({ userId, type = 'commande', titre, message, link }) => {
  if (!userId) return;
  try {
    const ref = await addDoc(collection(db, 'notifications'), {
      userId, type, titre, message: message || '', lu: false,
      createdAt: serverTimestamp(), link: link || null,
    });
    pousserNotification(ref.id);
  } catch (e) {
    console.error('Création de notification échouée :', e);
  }
};

// Écoute en direct toutes les notifications d'un livreur, plus récentes d'abord.
export const listenNotifications = (userId, callback) => {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => {
    console.error('Écoute notifications échouée :', err);
    callback([]);
  });
};

// Écoute en direct le nombre de notifications non lues — utilisé pour le badge.
export const listenUnreadCount = (userId, callback) => {
  if (!userId) return () => {};
  const q = query(collection(db, 'notifications'), where('userId', '==', userId), where('lu', '==', false));
  return onSnapshot(q, (snap) => callback(snap.size), (err) => {
    console.error('Écoute notifications non lues échouée :', err);
    callback(0);
  });
};

export const marquerNotificationLue = async (id) => {
  await updateDoc(doc(db, 'notifications', id), { lu: true });
};

export const marquerToutesLues = async (notifs) => {
  const nonLues = notifs.filter((n) => !n.lu);
  if (nonLues.length === 0) return;
  const batch = writeBatch(db);
  nonLues.forEach((n) => batch.update(doc(db, 'notifications', n.id), { lu: true }));
  await batch.commit();
};

export const supprimerNotification = async (id) => {
  await deleteDoc(doc(db, 'notifications', id));
};

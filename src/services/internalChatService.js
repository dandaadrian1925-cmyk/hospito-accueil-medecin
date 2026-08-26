import {
  collection, addDoc, query, where, onSnapshot, orderBy,
  serverTimestamp, getDocs, doc, updateDoc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { creerNotification } from './notificationsService';

const COL = 'admin_messages';

export const getOrCreateConversationInterne = async (user1Id, user2Id) => {
  const q = query(collection(db, COL), where('participants', 'array-contains', user1Id));
  const snap = await getDocs(q);
  const existing = snap.docs.find((d) => d.data().participants.includes(user2Id));
  if (existing) return existing.id;

  const ref = await addDoc(collection(db, COL), {
    participants: [user1Id, user2Id],
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const envoyerMessageInterne = async (conversationId, senderId, message, attachment) => {
  await addDoc(collection(db, COL, conversationId, 'messages'), {
    senderId, message, createdAt: serverTimestamp(),
    ...(attachment ? { attachmentPath: attachment.path, attachmentName: attachment.name } : {}),
  });
  await updateDoc(doc(db, COL, conversationId), {
    lastMessage: message,
    lastMessageAt: serverTimestamp(),
  });

  const convSnap = await getDoc(doc(db, COL, conversationId));
  const destinataire = convSnap.data()?.participants?.find((uid) => uid !== senderId);
  if (destinataire) {
    await creerNotification({
      userId: destinataire,
      type: 'message_interne',
      titre: 'Nouveau message',
      message: message.length > 80 ? `${message.slice(0, 80)}…` : message,
      link: '/messages',
    });
  }
};

export const listenMessagesInternes = (conversationId, callback) => {
  const q = query(collection(db, COL, conversationId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

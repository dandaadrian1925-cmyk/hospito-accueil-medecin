import {
  collection, addDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, getDocs, doc,
  updateDoc, getDoc, increment
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { creerNotification } from './notificationsService';

// ÉLEVÉE (audit sécurité, corrigé) : /\b\d{9,}\b/ exigeait 9 chiffres
// CONTIGUS — "6 91 23 45 67" ou "691.234.567" passait intact. Remplacé par
// un motif qui accepte des séparateurs (espace/point/tiret) entre les
// chiffres — même assouplissement appliqué en miroir côté firestore.rules.
const MOTS_INTERDITS = [
  /(?:\d[ .\-]*){9,}/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /https?:\/\/[^\s]+/g,
  /whatsapp/gi, /telegram/gi, /appelle.?moi/gi, /en dehors/gi,
  /hors app/gi, /mon num/gi, /mon numéro/gi, /contacte.?moi/gi,
];

export const filtrerMessage = (message) => {
  let filtered = message;
  let detected = false;
  MOTS_INTERDITS.forEach(pattern => {
    if (pattern.test(filtered)) {
      detected = true;
      filtered = filtered.replace(pattern, '***');
    }
  });
  return { filtered, detected };
};

export const getOrCreateConversation = async (user1Id, user2Id, annonceId) => {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', user1Id)
  );
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => {
    const data = d.data();
    return data.participants.includes(user2Id) && data.annonceId === annonceId;
  });
  if (existing) return existing.id;

  const ref = await addDoc(collection(db, 'conversations'), {
    participants: [user1Id, user2Id],
    annonceId,
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    avertissements: { [user1Id]: 0, [user2Id]: 0 },
    suspensions: {},
  });
  return ref.id;
};

export const envoyerMessage = async (conversationId, senderId, message) => {
  const convRef = doc(db, 'conversations', conversationId);

  // La suspension 24h était déjà écrite (avertissements.${senderId} atteignant 2) mais
  // jamais vérifiée avant d'envoyer ici — un utilisateur "suspendu" pouvait continuer à
  // écrire sans limite en passant par cette app plutôt que maket-client (déjà corrigé).
  const preSnap = await getDoc(convRef);
  const suspensionUntil = preSnap.data()?.suspensions?.[senderId];
  if (suspensionUntil && new Date(suspensionUntil) > new Date()) {
    throw new Error('CHAT_SUSPENDU');
  }

  const { filtered, detected } = filtrerMessage(message);

  if (detected) {
    const data = preSnap.data();
    const nbAvert = (data.avertissements?.[senderId] || 0) + 1;

    await updateDoc(convRef, {
      [`avertissements.${senderId}`]: nbAvert,
    });

    if (nbAvert === 2) {
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await updateDoc(convRef, { [`suspensions.${senderId}`]: until });
    }

    // Remonte au niveau du COMPTE (users/{uid}.avertissements), en plus du compteur
    // par conversation ci-dessus — sans ça, changer d'interlocuteur remettait le
    // compteur à 0 et un récidiviste ne cumulait jamais rien. Écriture isolée à ce
    // seul champ, +1 exactement (cf. firestore.rules) ; best-effort, ne doit jamais
    // faire échouer l'envoi du message lui-même.
    try {
      const userSnap = await getDoc(doc(db, 'users', senderId));
      const avertissementsCompte = (userSnap.data()?.avertissements || 0) + 1;
      await updateDoc(doc(db, 'users', senderId), { avertissements: avertissementsCompte });
    } catch (e) {
      console.error('Incrément avertissements compte échoué :', e);
    }

    return { censured: true, avertissements: nbAvert };
  }

  await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
    senderId,
    message: filtered,
    lu: false,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'conversations', conversationId), {
    lastMessage: filtered,
    lastMessageAt: serverTimestamp(),
  });

  // Notifie le destinataire — sans ça, un message n'était visible que si l'autre
  // partie avait déjà la conversation ouverte. Best-effort.
  try {
    const autreUserId = (preSnap.data()?.participants || []).find((p) => p !== senderId);
    if (autreUserId) {
      await creerNotification({
        userId: autreUserId,
        type: 'message',
        titre: 'Nouveau message',
        message: filtered.length > 80 ? `${filtered.slice(0, 80)}…` : filtered,
        link: `/chat/${conversationId}`,
      });
    }
  } catch (e) {
    console.error('Notification nouveau message échouée :', e);
  }

  return { censured: false };
};

export const listenMessages = (conversationId, callback) => {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const getConversations = (userId, callback) => {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

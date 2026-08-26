import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../firebase/config';

// Annuaire du personnel actif de l'établissement — pour la messagerie interne.
export const getStaffContacts = async (etablissementId) => {
  const affSnap = await getDocs(query(collection(db, 'affiliations'), where('etablissementId', '==', etablissementId), where('actif', '==', true)));
  const uids = [...new Set(affSnap.docs.map((d) => d.data().userId))];
  if (uids.length === 0) return [];
  const map = {};
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    const usersSnap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
    usersSnap.docs.forEach((d) => { map[d.id] = d.data(); });
  }
  return uids.map((uid) => ({ id: uid, displayName: map[uid]?.displayName, email: map[uid]?.email }));
};

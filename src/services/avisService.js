import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

// Avis reçus par le livreur (en tant que cible), plus récents d'abord
export const getAvisByUser = async (userId) => {
  const q = query(
    collection(db, 'avis'),
    where('cibleId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  const avis = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const moyenne = avis.length
    ? Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10
    : null;
  return { avis, moyenne, total: avis.length };
};

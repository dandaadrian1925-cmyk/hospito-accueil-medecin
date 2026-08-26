import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

// Lecture seule côté accueil — la gestion des lits se fait depuis
// hospito-admin (§4.5). Même collection partagée, scopée par établissement.
export const listenServices = (etablissementId, callback) => {
  const q = query(collection(db, 'services'), where('etablissementId', '==', etablissementId), orderBy('nom', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const listenLits = (etablissementId, callback) => {
  const q = query(collection(db, 'lits'), where('etablissementId', '==', etablissementId), orderBy('numero', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

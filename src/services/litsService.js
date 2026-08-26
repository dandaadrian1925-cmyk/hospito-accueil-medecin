import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

// Lecture seule côté accueil — la gestion des lits (création, changement de
// statut) se fait depuis hospito-admin (§4.5). Même collection partagée.
export const listenServices = (callback) => {
  const q = query(collection(db, 'services'), orderBy('nom', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const listenLits = (callback) => {
  const q = query(collection(db, 'lits'), orderBy('numero', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

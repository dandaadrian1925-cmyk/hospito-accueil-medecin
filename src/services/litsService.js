import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

// #retiré (demande utilisateur) : listenLits() a été retiré avec la page
// "Disponibilité des lits" — le suivi lit-par-lit a été abandonné côté
// hospito-admin (remplacé par l'annuaire "Services hospitaliers"), cette
// collection n'a plus jamais été alimentée. Seul listenServices survit ici,
// utilisé par billets/planning/rendez-vous — nom de fichier conservé pour ne
// pas devoir mettre à jour ces trois imports.
export const listenServices = (etablissementId, callback) => {
  const q = query(collection(db, 'services'), where('etablissementId', '==', etablissementId), orderBy('nom', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

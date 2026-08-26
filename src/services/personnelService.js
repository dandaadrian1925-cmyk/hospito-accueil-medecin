import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { STAFF_ROLES } from '../lib/permissions';

// Annuaire du personnel (toutes apps confondues) — pour la messagerie interne.
export const getStaffContacts = async () => {
  const q = query(collection(db, 'users'), where('role', 'in', STAFF_ROLES), orderBy('displayName', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

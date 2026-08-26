import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// Livreurs vérifiés, optionnellement filtrés par ville (#livraison : listings
// scopés à une ville, cohérent avec la restriction géographique des
// opportunités — cf. commandesService.listenOpportunites). ville omise =
// comportement historique (tous les livreurs), pour rester rétrocompatible avec
// tout appelant existant.
export const getLivreursDisponibles = async (excludeUid, ville) => {
  const contraintes = [where('role', '==', 'livreur')];
  if (ville) contraintes.push(where('ville', '==', ville));
  const q = query(collection(db, 'users'), ...contraintes);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => l.id !== excludeUid && !l.banni && l.cniVerifie && l.contratSigne);
};

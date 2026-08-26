import { collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

// Lecture seule côté accueil — l'identité administrative du patient est créée
// et modifiée depuis hospito-admin (§4.2). Même collection Firestore
// partagée, scopée par établissement.
export const buildPatientsQuery = (etablissementId) =>
  query(collection(db, 'patients'), where('etablissementId', '==', etablissementId), orderBy('createdAt', 'desc'));

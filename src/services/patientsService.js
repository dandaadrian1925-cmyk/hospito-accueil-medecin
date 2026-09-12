import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Lecture seule côté accueil — l'identité administrative du patient est créée
// et modifiée depuis hospito-admin (§4.2). Même collection Firestore
// partagée, scopée par établissement.
export const buildPatientsQuery = (etablissementId) =>
  query(collection(db, 'patients'), where('etablissementId', '==', etablissementId), orderBy('createdAt', 'desc'));

// #nouveau (demande utilisateur, "la confirmation n'est possible que s'il a
// un billet de consultation valide au jour du rendez-vous") : une demande de
// RDV en ligne (demandes_rendez_vous) ne porte que patientUid (compte
// hospito-patient), jamais patientId (fiche interne, propre à CET
// établissement) — le lien se fait via le numéro d'identité national
// (même clé déjà utilisée ailleurs dans le projet pour relier compte app et
// fiche interne). Retourne null si le patient n'a encore aucune fiche dans
// CET établissement (jamais physiquement venu).
// #corrigé (re-audit, "un doublon fusionné garde le même CNI — sans filtrer
// fusionneDans, cette résolution peut retomber sur la fiche fusionnée
// (stale) plutôt que sur la fiche conservée") : même garde que
// hospito-admin::trouverPatientParCni.
export const trouverFicheParPatientUid = async (patientUid, etablissementId) => {
  const userSnap = await getDoc(doc(db, 'users', patientUid));
  const cni = userSnap.exists() ? userSnap.data().numeroIdentiteNational : null;
  if (!cni) return null;
  const snap = await getDocs(query(
    collection(db, 'patients'),
    where('etablissementId', '==', etablissementId),
    where('numeroIdentiteNational', '==', cni),
  ));
  const match = snap.docs.find((d) => !d.data().fusionneDans);
  return match ? { id: match.id, ...match.data() } : null;
};

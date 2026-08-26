import { Timestamp, where } from 'firebase/firestore';

// Construit les clauses `where` Firestore pour un filtre de plage de dates —
// `debut`/`fin` sont des chaînes "YYYY-MM-DD" (ou null). `fin` est étendu à la fin
// de la journée (23:59:59) pour inclure toute la journée sélectionnée, pas juste
// son tout premier instant.
export const clausesPlageDate = (champ, debut, fin) => {
  const clauses = [];
  if (debut) clauses.push(where(champ, '>=', Timestamp.fromDate(new Date(`${debut}T00:00:00`))));
  if (fin) clauses.push(where(champ, '<=', Timestamp.fromDate(new Date(`${fin}T23:59:59`))));
  return clauses;
};

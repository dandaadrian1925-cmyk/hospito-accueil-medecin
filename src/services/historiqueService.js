import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

// #nouveau (demande utilisateur, "une ligne Historique pour afficher tous
// les rdv passés et expirés avec des filtres sur les dates et sur les
// médecins du service avec une barre de recherche") : les RDV vivent dans
// DEUX collections distinctes et jamais fusionnées (voir
// demandesRendezVousService.js) — `rendez_vous` (pris directement au
// guichet, jamais de médecin assigné) et `demandes_rendez_vous` (soumis en
// ligne, `medecinId`/`medecinNom` posés à la confirmation). Un historique
// complet doit donc interroger les deux et les fusionner ici, normalisées
// dans une forme commune ; le filtrage par service/médecin/recherche reste
// CLIENT (comme partout ailleurs dans ce projet), seule la plage de dates
// est filtrée côté serveur pour ne jamais charger tout l'historique d'un
// établissement en une fois.
export const chargerHistoriqueRdv = async (etablissementId, dateDebut, dateFin) => {
  const debut = Timestamp.fromDate(new Date(`${dateDebut}T00:00:00`));
  const fin = Timestamp.fromDate(new Date(`${dateFin}T23:59:59`));

  const [rdvSnap, demandesSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'rendez_vous'),
      where('etablissementId', '==', etablissementId),
      where('dateHeure', '>=', debut), where('dateHeure', '<=', fin),
      orderBy('dateHeure', 'asc'),
    )),
    getDocs(query(
      collection(db, 'demandes_rendez_vous'),
      where('etablissementId', '==', etablissementId), where('statut', '==', 'confirme'),
      where('dateHeure', '>=', debut), where('dateHeure', '<=', fin),
      orderBy('dateHeure', 'asc'),
    )),
  ]);

  const guichet = rdvSnap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id, origine: 'guichet', patientNom: r.patientNom, serviceId: r.serviceId || null,
      serviceNom: r.service || null, medecinId: null, medecinNom: null,
      dateHeure: r.dateHeure, statut: r.statut, motif: r.motif || null,
    };
  });
  const enLigne = demandesSnap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id, origine: 'en_ligne', patientNom: r.patientNom, serviceId: r.serviceId || null,
      serviceNom: r.serviceNom || null, medecinId: r.medecinId || null, medecinNom: r.medecinNom || null,
      dateHeure: r.dateHeure, statut: r.type === 'teleconsultation' ? 'teleconsultation' : 'confirme', motif: r.motif || null,
    };
  });

  return [...guichet, ...enLigne].sort((a, b) => (b.dateHeure?.toMillis?.() || 0) - (a.dateHeure?.toMillis?.() || 0));
};

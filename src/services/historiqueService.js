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
// #corrigé (retour utilisateur, "j'ai pris beaucoup trop de rendez-vous
// pour que tous les statuts n'affichent qu'une seule ligne") : une demande
// en ligne encore 'en_attente' (ou 'refusee') n'a JAMAIS de `dateHeure` —
// ce champ n'est posé que par confirmerDemande, à la confirmation. Filtrer
// sur `dateHeure` (comme la branche 'confirme' ci-dessous) excluait donc
// TOUJOURS ces deux statuts, quel que soit le filtre choisi côté écran —
// une seule demande réellement confirmée pouvait ainsi masquer des dizaines
// d'autres, toujours en attente ou refusées. Ces deux statuts sont
// désormais filtrés sur `createdAt` (date de la demande elle-même, seule
// date qu'ils possèdent) plutôt que sur la date du rendez-vous souhaité.
export const chargerHistoriqueRdv = async (etablissementId, dateDebut, dateFin) => {
  const debut = Timestamp.fromDate(new Date(`${dateDebut}T00:00:00`));
  const fin = Timestamp.fromDate(new Date(`${dateFin}T23:59:59`));

  const [rdvSnap, confirmeesSnap, enAttenteSnap, refuseesSnap] = await Promise.all([
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
    getDocs(query(
      collection(db, 'demandes_rendez_vous'),
      where('etablissementId', '==', etablissementId), where('statut', '==', 'en_attente'),
      where('createdAt', '>=', debut), where('createdAt', '<=', fin),
      orderBy('createdAt', 'desc'),
    )),
    getDocs(query(
      collection(db, 'demandes_rendez_vous'),
      where('etablissementId', '==', etablissementId), where('statut', '==', 'refuse'),
      where('createdAt', '>=', debut), where('createdAt', '<=', fin),
      orderBy('createdAt', 'desc'),
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
  const confirmees = confirmeesSnap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id, origine: 'en_ligne', patientNom: r.patientNom, serviceId: r.serviceId || null,
      serviceNom: r.serviceNom || null, medecinId: r.medecinId || null, medecinNom: r.medecinNom || null,
      dateHeure: r.dateHeure, statut: r.type === 'teleconsultation' ? 'teleconsultation' : 'confirme', motif: r.motif || null,
    };
  });
  // #corrigé : dateHeure reprend createdAt (seule date connue à ce stade) —
  // affichée telle quelle dans la colonne "Date / heure" de l'historique.
  const enAttente = enAttenteSnap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id, origine: 'en_ligne', patientNom: r.patientNom, serviceId: r.serviceId || null,
      serviceNom: r.serviceNom || null, medecinId: r.medecinPrefereId || null, medecinNom: r.medecinPrefereNom || null,
      dateHeure: r.createdAt, statut: 'en_attente', motif: r.motif || null,
    };
  });
  const refusees = refuseesSnap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id, origine: 'en_ligne', patientNom: r.patientNom, serviceId: r.serviceId || null,
      serviceNom: r.serviceNom || null, medecinId: r.medecinPrefereId || null, medecinNom: r.medecinPrefereNom || null,
      dateHeure: r.createdAt, statut: 'refuse', motif: r.motif || null,
    };
  });

  return [...guichet, ...confirmees, ...enAttente, ...refusees]
    .sort((a, b) => (b.dateHeure?.toMillis?.() || 0) - (a.dateHeure?.toMillis?.() || 0));
};

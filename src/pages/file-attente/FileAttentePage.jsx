import { useEffect, useMemo, useState } from 'react';
import { Ticket, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listenRendezVous } from '../../services/rendezVousService';
import { listenDemandesConfirmees } from '../../services/demandesRendezVousService';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import StatusBadge from '../../components/common/StatusBadge';

const debutJour = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const finJour = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

const PERIODES = {
  aujourdhui: () => { const j = new Date(); return [debutJour(j), finJour(j)]; },
  demain: () => { const j = new Date(); j.setDate(j.getDate() + 1); return [debutJour(j), finJour(j)]; },
  semaine: () => {
    const j = new Date();
    const decalageLundi = j.getDay() === 0 ? -6 : 1 - j.getDay();
    const lundi = new Date(j); lundi.setDate(j.getDate() + decalageLundi);
    const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
    return [debutJour(lundi), finJour(dimanche)];
  },
  mois: () => {
    const j = new Date();
    return [debutJour(new Date(j.getFullYear(), j.getMonth(), 1)), finJour(new Date(j.getFullYear(), j.getMonth() + 1, 0))];
  },
};
const LABEL_PERIODE = { aujourdhui: "Aujourd'hui", demain: 'Demain', semaine: 'Cette semaine', mois: 'Ce mois', personnalise: 'Personnalisé' };
const versInput = (d) => d.toISOString().slice(0, 10);

// Guichet (rendez_vous, statut) — 'annule'/'termine'/'absent' ne sont plus
// des rendez-vous À VENIR, ils sortent de la file.
const LABEL_STATUT_GUICHET = { planifie: 'Planifié', confirme: 'Confirmé' };
const TONE_STATUT_GUICHET = { planifie: 'amber', confirme: 'green' };
const LABEL_ORIGINE = { guichet: 'Guichet', en_ligne: 'RDV en ligne', teleconsultation: 'Téléconsultation' };
const TONE_ORIGINE = { guichet: 'gray', en_ligne: 'blue', teleconsultation: 'blue' };

// #reconstruit (demande utilisateur, "la File d'attente doit contenir les
// patients ayant un rendez-vous confirmé par l'accueil, avec toutes les
// informations, en gardant les filtres de date actuels") : abandonne
// entièrement l'ancienne approche basée sur billets_session/statut 'pret'
// (source de confusion répétée — un billet payé/vu n'est pas un rendez-vous,
// et inversement) au profit d'une vraie liste de RENDEZ-VOUS : ceux pris au
// guichet ("Rendez-vous > Nouveau rendez-vous", collection rendez_vous,
// statut planifié ou confirmé) ET les demandes en ligne que l'accueil a
// explicitement confirmées ("Demandes en ligne > Confirmer",
// demandes_rendez_vous statut 'confirme'). Les mêmes filtres de période
// (aujourd'hui/demain/cette semaine/ce mois/personnalisé) restent
// fonctionnels, appliqués côté client sur l'heure du rendez-vous — même
// principe qu'avant, aucun nouvel index Firestore requis.
export default function FileAttentePage() {
  const { userProfile, etablissementId } = useAuth();
  const [rendezVous, setRendezVous] = useState(null);
  const [demandesConfirmees, setDemandesConfirmees] = useState(null);
  const [periode, setPeriode] = useState('aujourdhui');
  const [personnaliseDebut, setPersonnaliseDebut] = useState(versInput(new Date()));
  const [personnaliseFin, setPersonnaliseFin] = useState(versInput(new Date()));

  const [dateDebut, dateFin] = useMemo(() => {
    if (periode === 'personnalise') return [debutJour(new Date(personnaliseDebut)), finJour(new Date(personnaliseFin))];
    return PERIODES[periode]();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, personnaliseDebut, personnaliseFin]);

  useEffect(() => listenRendezVous(etablissementId, setRendezVous), [etablissementId]);
  useEffect(() => listenDemandesConfirmees(etablissementId, setDemandesConfirmees), [etablissementId]);

  const monServiceId = userProfile?.serviceId;

  const rendezVousConfirmes = useMemo(() => {
    if (!monServiceId || rendezVous === null || demandesConfirmees === null) return null;
    const duGuichet = rendezVous
      .filter((r) => r.serviceId === monServiceId && (r.statut === 'planifie' || r.statut === 'confirme'))
      .map((r) => ({
        id: `rdv_${r.id}`,
        patientNom: r.patientNom,
        heure: r.dateHeure?.toDate?.() || null,
        service: r.service,
        medecinNom: null,
        motif: r.motif,
        statutLabel: LABEL_STATUT_GUICHET[r.statut],
        statutTone: TONE_STATUT_GUICHET[r.statut],
        origine: 'guichet',
      }));
    const enLigne = demandesConfirmees
      .filter((d) => d.serviceId === monServiceId)
      .map((d) => ({
        id: `demande_${d.id}`,
        patientNom: d.patientNom,
        heure: d.dateHeure?.toDate?.() || null,
        service: d.serviceNom,
        medecinNom: d.medecinNom,
        motif: d.motif,
        statutLabel: 'Confirmé',
        statutTone: 'green',
        origine: d.type === 'teleconsultation' ? 'teleconsultation' : 'en_ligne',
      }));
    return [...duGuichet, ...enLigne]
      .filter((r) => r.heure && r.heure >= dateDebut && r.heure <= dateFin)
      .sort((a, b) => a.heure - b.heure);
  }, [rendezVous, demandesConfirmees, monServiceId, dateDebut, dateFin]);

  if (!userProfile?.serviceId) {
    return (
      <EmptyState
        title="Aucun service assigné à votre compte"
        description="Un administrateur doit vous rattacher à un service hospitalier (fiche Personnel, hospito-admin) avant que la file d'attente ne puisse s'afficher."
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Ticket size={22} className="text-primary" /> File d'attente
        </h1>
        <p className="text-muted-foreground mt-1">
          Patients ayant un rendez-vous confirmé pour {userProfile.service || 'votre service'}, dans l'ordre de leurs rendez-vous.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(LABEL_PERIODE).map((p) => (
            <Button key={p} type="button" size="sm" variant={periode === p ? 'default' : 'outline'} onClick={() => setPeriode(p)}>
              {LABEL_PERIODE[p]}
            </Button>
          ))}
        </div>
        {periode === 'personnalise' && (
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label>Du</Label>
              <Input type="date" value={personnaliseDebut} onChange={(e) => setPersonnaliseDebut(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Au</Label>
              <Input type="date" value={personnaliseFin} onChange={(e) => setPersonnaliseFin(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {rendezVousConfirmes === null ? (
        <Loader label="Chargement de la file d'attente…" />
      ) : !rendezVousConfirmes.length ? (
        <EmptyState title="Aucun rendez-vous" description="Les rendez-vous confirmés (au guichet ou depuis une demande en ligne) apparaîtront ici, triés par heure, pour la période choisie." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rendezVousConfirmes.map((r) => (
            <div key={r.id} className="glass-card-elevated p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{r.patientNom}</span>
                <div className="flex gap-1.5 flex-shrink-0">
                  <StatusBadge label={LABEL_ORIGINE[r.origine]} tone={TONE_ORIGINE[r.origine]} />
                  <StatusBadge label={r.statutLabel} tone={r.statutTone} />
                </div>
              </div>
              {r.heure && (
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Clock size={12} /> {r.heure.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {r.heure.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {r.service && <p className="text-sm text-muted-foreground">{r.service}</p>}
              {r.medecinNom && <p className="text-sm text-muted-foreground">Dr {r.medecinNom}</p>}
              {r.motif && <p className="text-xs text-muted-foreground italic">{r.motif}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

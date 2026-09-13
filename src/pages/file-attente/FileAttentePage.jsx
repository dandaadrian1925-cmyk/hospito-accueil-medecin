import { useEffect, useMemo, useState } from 'react';
import { Ticket, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listenFileAttente } from '../../services/billetsSessionService';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';

const debutJour = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const finJour = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

// #nouveau (demande utilisateur, "quand on confirme un rendez-vous ça doit
// apparaître dans la file d'attente en ordre des rendez-vous, avec des
// filtres aujourd'hui/demain/cette semaine/ce mois/personnalisé") : semaine
// au sens ISO (lundi → dimanche), cohérent avec le reste du projet
// francophone.
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

// #nouveau (demande utilisateur, "je voudrais que la sidebar de l'accueil
// médecin ait aussi file d'attente donc lorsqu'un rendez-vous est confirmé,
// il entre directement dans la file d'attente du médecin en question") :
// vue d'ensemble, pour l'accueil de son service, des patients "prêts" pour
// consultation — qu'ils soient arrivés par un billet physique ou par un RDV
// en ligne confirmé (cf. confirmerDemande, demandesRendezVousService.js,
// qui rattache désormais le billet au médecin + à l'heure du RDV). Triée
// par heure effective (RDV si connu, sinon heure d'arrivée), jamais par
// heure de création du billet seule.
export default function FileAttentePage() {
  const { userProfile, etablissementId } = useAuth();
  const [billets, setBillets] = useState(null);
  const [periode, setPeriode] = useState('aujourdhui');
  const [personnaliseDebut, setPersonnaliseDebut] = useState(versInput(new Date()));
  const [personnaliseFin, setPersonnaliseFin] = useState(versInput(new Date()));

  const [dateDebut, dateFin] = useMemo(() => {
    if (periode === 'personnalise') return [debutJour(new Date(personnaliseDebut)), finJour(new Date(personnaliseFin))];
    return PERIODES[periode]();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, personnaliseDebut, personnaliseFin]);

  useEffect(() => {
    if (!userProfile?.serviceId) return;
    return listenFileAttente(etablissementId, userProfile.serviceId, dateDebut, dateFin, setBillets);
  }, [etablissementId, userProfile?.serviceId, dateDebut, dateFin]);

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
          Patients prêts pour consultation pour {userProfile.service || 'votre service'}, dans l'ordre de leurs rendez-vous.
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

      {billets === null ? (
        <Loader label="Chargement de la file d'attente…" />
      ) : !billets.length ? (
        <EmptyState title="Aucun patient en attente" description="Les billets prêts (arrivée physique ou RDV en ligne confirmé) apparaîtront ici, triés par heure, pour la période choisie." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {billets.map((b) => {
            const heure = (b.dateHeure?.toDate?.() || b.createdAt?.toDate?.());
            return (
              <div key={b.id} className="glass-card-elevated p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{b.patientNom}</span>
                  {heure && (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary flex-shrink-0">
                      <Clock size={12} /> {heure.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {heure.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{b.medecinNom ? `Dr ${b.medecinNom}` : 'Aucun médecin assigné'}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Ticket, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listenFileAttente } from '../../services/billetsSessionService';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';

// #nouveau (demande utilisateur, "je voudrais que la sidebar de l'accueil
// médecin ait aussi file d'attente donc lorsqu'un rendez-vous est confirmé,
// il entre directement dans la file d'attente du médecin en question") :
// vue d'ensemble, pour l'accueil de son service, des patients "prêts" pour
// consultation aujourd'hui — qu'ils soient arrivés par un billet physique
// ou par un RDV en ligne confirmé (cf. confirmerDemande,
// demandesRendezVousService.js, qui rattache désormais le billet au
// médecin + à l'heure du RDV). Triée par heure effective (RDV si connu,
// sinon heure d'arrivée), jamais par heure de création du billet seule.
export default function FileAttentePage() {
  const { userProfile, etablissementId } = useAuth();
  const [billets, setBillets] = useState(null);

  useEffect(() => {
    if (!userProfile?.serviceId) return;
    return listenFileAttente(etablissementId, userProfile.serviceId, setBillets);
  }, [etablissementId, userProfile?.serviceId]);

  if (!userProfile?.serviceId) {
    return (
      <EmptyState
        title="Aucun service assigné à votre compte"
        description="Un administrateur doit vous rattacher à un service hospitalier (fiche Personnel, hospito-admin) avant que la file d'attente ne puisse s'afficher."
      />
    );
  }

  if (billets === null) return <Loader label="Chargement de la file d'attente…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Ticket size={22} className="text-primary" /> File d'attente
        </h1>
        <p className="text-muted-foreground mt-1">
          Patients prêts pour consultation aujourd'hui pour {userProfile.service || 'votre service'}, dans l'ordre de leurs rendez-vous.
        </p>
      </div>

      {!billets.length ? (
        <EmptyState title="Aucun patient en attente" description="Les billets prêts (arrivée physique ou RDV en ligne confirmé) apparaîtront ici, triés par heure." />
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
                      <Clock size={12} /> {heure.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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

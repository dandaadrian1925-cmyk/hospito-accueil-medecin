import { useEffect, useState } from 'react';
import { BedDouble } from 'lucide-react';
import { listenServices, listenLits } from '../../services/litsService';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';

const TONE_STATUT = { libre: 'green', occupe: 'red', maintenance: 'amber', reserve: 'blue' };
const LABEL_STATUT = { libre: 'Libre', occupe: 'Occupé', maintenance: 'Maintenance', reserve: 'Réservé' };

export default function LitsPage() {
  const { etablissementId } = useAuth();
  const [services, setServices] = useState(null);
  const [lits, setLits] = useState(null);

  useEffect(() => listenServices(etablissementId, setServices), [etablissementId]);
  useEffect(() => listenLits(etablissementId, setLits), [etablissementId]);

  if (services === null || lits === null) return <Loader label="Chargement des lits…" />;

  const litsParService = services.map((service) => ({
    service,
    lits: (lits || []).filter((l) => l.service === service.id),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <BedDouble size={22} className="text-primary" /> Disponibilité des lits
        </h1>
        <p className="text-muted-foreground mt-1">Vue en lecture seule — la gestion se fait depuis l'administration.</p>
      </div>

      {!services.length ? (
        <EmptyState title="Aucun service défini" />
      ) : (
        <div className="space-y-8">
          {litsParService.map(({ service, lits: litsService }) => {
            const libres = litsService.filter((l) => l.statut === 'libre').length;
            return (
              <div key={service.id}>
                <h2 className="font-display text-base font-semibold text-foreground mb-3">
                  {service.nom} <span className="text-muted-foreground font-normal text-sm">({libres} libre{libres > 1 ? 's' : ''} / {litsService.length})</span>
                </h2>
                {!litsService.length ? (
                  <p className="text-sm text-muted-foreground">Aucun lit dans ce service.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {litsService.map((lit) => (
                      <div key={lit.id} className="glass-card-elevated p-4 flex items-center justify-between">
                        <span className="font-semibold text-foreground">Lit {lit.numero}</span>
                        <StatusBadge label={LABEL_STATUT[lit.statut]} tone={TONE_STATUT[lit.statut]} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

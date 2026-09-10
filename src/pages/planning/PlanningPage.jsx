import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CRENEAUX, listenPlanning } from '../../services/planningService';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';

const LABEL_CRENEAU = { matin: 'Matin', 'apres-midi': 'Après-midi', nuit: 'Nuit' };

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aujourdHui = () => toISO(new Date());
const dansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISO(d);
};

// Vue LECTURE SEULE — la gestion du planning (plages horaires, plusieurs
// médecins par plage, synthèse IA) est désormais centralisée dans
// hospito-admin ; l'accueil garde ici uniquement de quoi savoir qui est de
// garde pour confirmer un rendez-vous, sans pouvoir modifier le roster
// (cf. planningService.js pour le détail du conflit d'écriture corrigé).
export default function PlanningPage() {
  const { userProfile, etablissementId } = useAuth();
  const monService = userProfile?.service || null;
  const monServiceId = userProfile?.serviceId || null;

  const [planning, setPlanning] = useState(null);

  const dateDebut = aujourdHui();
  const dateFin = dansNJours(13);

  useEffect(() => listenPlanning(etablissementId, dateDebut, dateFin, setPlanning), [etablissementId]);

  const planningAffiche = useMemo(() => {
    if (!monServiceId) return planning || [];
    return (planning || []).filter((c) => !c.serviceId || c.serviceId === monServiceId);
  }, [planning, monServiceId]);

  const parJour = useMemo(() => {
    const groupes = {};
    planningAffiche.forEach((c) => { (groupes[c.date] ||= []).push(c); });
    return Object.entries(groupes).sort(([a], [b]) => a.localeCompare(b));
  }, [planningAffiche]);

  if (planning === null) return <Loader label="Chargement du planning…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock size={22} className="text-primary" /> Planning des médecins
        </h1>
        <p className="text-muted-foreground mt-1">
          {monService ? `Créneaux de garde — ${monService}, 14 prochains jours.` : 'Créneaux de garde sur les 14 prochains jours.'}
          {' '}Géré par l'administration de l'établissement.
        </p>
      </div>

      {!parJour.length ? (
        <EmptyState title="Aucun créneau planifié" description="Les créneaux définis par l'administration pour les 14 prochains jours apparaîtront ici." />
      ) : (
        <div className="space-y-5">
          {parJour.map(([date, creneaux]) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-foreground mb-2">
                {new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {creneaux.map((c) => (
                  <div key={c.id} className="glass-card-elevated p-3">
                    <p className="font-semibold text-foreground text-sm">{c.personnelNom}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.heureDebut && c.heureFin ? `${c.heureDebut}–${c.heureFin}` : LABEL_CRENEAU[c.creneau]}
                      {c.serviceNom ? ` · ${c.serviceNom}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

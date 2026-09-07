import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/permissions';
import { HOSPITAL_MODULES } from '../lib/hospitalModules';
import { listenServices } from '../services/litsService';

export default function DashboardPage() {
  const { userProfile, etablissementId } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);

  // Un accueil restreint à UN SEUL service (servicesAutorises, réglé depuis
  // hospito-admin) n'a plus besoin de choisir son service nulle part dans
  // cette app — le tableau de bord l'affiche directement, en clair.
  const restriction = userProfile?.servicesAutorises;
  const monServiceId = restriction?.length === 1 ? restriction[0] : null;

  useEffect(() => {
    if (!monServiceId || !etablissementId) return;
    return listenServices(etablissementId, setServices);
  }, [monServiceId, etablissementId]);

  const monService = services.find((s) => s.id === monServiceId);

  const parPhase = HOSPITAL_MODULES.reduce((acc, m) => {
    (acc[m.phase] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenue, {userProfile?.displayName || ''} — {roleLabel(userProfile?.role)}.
        </p>
      </div>

      {monServiceId && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
          <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center flex-shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Vous gérez</p>
            <p className="font-display font-semibold text-foreground">{monService?.nom || '…'}</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Modules</h2>
        {Object.entries(parPhase).map(([phase, modules]) => (
          <div key={phase}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{phase}</h3>
            <div className="flex flex-wrap gap-2">
              {modules.map((m) => (
                <button
                  key={m.path}
                  onClick={() => navigate(`/${m.path}`)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                    bg-card border border-border text-foreground hover:bg-accent transition-colors"
                >
                  <m.icon size={15} /> {m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

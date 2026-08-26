import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/permissions';
import { HOSPITAL_MODULES } from '../lib/hospitalModules';

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

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

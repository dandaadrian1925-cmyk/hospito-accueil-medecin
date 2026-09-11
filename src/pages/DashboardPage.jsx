import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Ticket, CalendarClock, Stethoscope, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/permissions';
import { HOSPITAL_MODULES } from '../lib/hospitalModules';
import { listenServices } from '../services/litsService';
import { listenBilletsDuJour } from '../services/billetsSessionService';
import { buildRendezVousQuery } from '../services/rendezVousService';
import { listerMedecinsActifs, jourDeLaSemaineAujourdhui } from '../services/planningService';
import { onSnapshot } from 'firebase/firestore';
import StatCard from '../components/common/StatCard';

// #refonte (demande utilisateur, "le design du tableau de bord ne me plaît
// vraiment pas") : reprend exactement la structure de hospito-admin
// (rangée de StatCard, puis grille de modules en cartes avec bouton "Ouvrir")
// au lieu de la simple liste de boutons-pilules qu'il y avait ici avant.
export default function DashboardPage() {
  const { userProfile, etablissementId } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [billetsDuJour, setBilletsDuJour] = useState(null);
  const [rdvDuJour, setRdvDuJour] = useState(null);
  const [medecins, setMedecins] = useState(null);

  // Chaque compte accueil gère toujours exactement un service (serviceId,
  // réglé depuis hospito-admin) — le tableau de bord l'affiche directement,
  // en clair, jamais de choix à faire ici.
  const monServiceId = userProfile?.serviceId || null;

  useEffect(() => {
    if (!monServiceId || !etablissementId) return;
    return listenServices(etablissementId, setServices);
  }, [monServiceId, etablissementId]);

  useEffect(() => {
    if (!etablissementId) return;
    return listenBilletsDuJour(etablissementId, setBilletsDuJour);
  }, [etablissementId]);

  useEffect(() => {
    if (!etablissementId) return;
    return onSnapshot(buildRendezVousQuery(etablissementId), (snap) => setRdvDuJour(snap.docs.map((d) => d.data())));
  }, [etablissementId]);

  useEffect(() => {
    if (!etablissementId) return;
    listerMedecinsActifs(etablissementId).then(setMedecins).catch(() => setMedecins([]));
  }, [etablissementId]);

  const monService = services.find((s) => s.id === monServiceId);
  // #nouveau — même logique que Sidebar.jsx : Admissions/Visites n'ont de
  // sens que pour un service qui héberge réellement des patients.
  const hospitalise = !monService?.type || monService.type === 'hospitalisation';
  const modulesVisibles = HOSPITAL_MODULES.filter((m) => hospitalise || !['admissions', 'visites'].includes(m.path));

  const parPhase = modulesVisibles.reduce((acc, m) => {
    (acc[m.phase] ||= []).push(m);
    return acc;
  }, {});

  const billetsMonService = monServiceId ? (billetsDuJour || []).filter((b) => b.serviceId === monServiceId) : billetsDuJour;
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const rdvAujourdhui = (rdvDuJour || []).filter((r) => r.dateHeure?.toDate && r.dateHeure.toDate().toISOString().slice(0, 10) === aujourdHui);

  // #nouveau (demande utilisateur, "le tableau de bord de l'accueil doit
  // avoir le ou les médecins du service en poste le jour en question avec
  // les horaires de chacun") : issu du planning hebdomadaire RÉCURRENT de
  // chaque médecin (horairesHabituels, saisi une fois côté hospito-admin) —
  // jamais des `plannings` datés au jour le jour, quasi jamais renseignés en
  // pratique. Une entrée dont le jour ne correspond pas à aujourd'hui
  // n'apparaît simplement pas — "certains samedis" reste une case entrée
  // par l'admin comme n'importe quel autre jour, sans notion de semaine sur
  // deux.
  const jourAujourdhui = jourDeLaSemaineAujourdhui();
  const medecinsDuService = monServiceId ? (medecins || []).filter((m) => m.serviceId === monServiceId) : (medecins || []);
  const medecinsEnPoste = medecinsDuService
    .map((m) => ({ ...m, creneauxAujourdhui: (m.horairesHabituels || []).filter((h) => h.jour === jourAujourdhui) }))
    .filter((m) => m.creneauxAujourdhui.length > 0);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenue, {userProfile?.displayName || ''} — {roleLabel(userProfile?.role)}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {monService && (
          <StatCard label="Vous gérez" value={monService.nom} icon={Building2} onClick={() => navigate('/profil')} />
        )}
        <StatCard label="Billets aujourd'hui" value={billetsMonService === null ? '…' : billetsMonService.length} icon={Ticket} onClick={() => navigate('/billets')} />
        <StatCard label="Rendez-vous aujourd'hui" value={rdvDuJour === null ? '…' : rdvAujourdhui.length} icon={CalendarClock} onClick={() => navigate('/rendez-vous')} />
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
          <Stethoscope size={18} className="text-primary" /> Médecins en poste aujourd'hui
        </h2>
        {medecins === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : medecinsEnPoste.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun médecin en poste aujourd'hui selon les horaires habituels renseignés pour ce service.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {medecinsEnPoste.map((m) => (
              <div key={m.uid} className="glass-card-elevated p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary text-primary flex items-center justify-center font-display font-bold flex-shrink-0">
                  {(m.nom || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">Dr {m.nom}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {m.creneauxAujourdhui.map((h, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5">
                        <Clock size={11} /> {h.heureDebut}–{h.heureFin}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Modules</h2>
        {Object.entries(parPhase).map(([phase, modules]) => (
          <div key={phase} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{phase}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {modules.map((m) => (
                <div key={m.path} className="glass-card-elevated p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center">
                    <m.icon size={20} />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{m.label}</p>
                  <button
                    onClick={() => navigate(`/${m.path}`)}
                    className="mt-1 px-3 py-1 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Ouvrir
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

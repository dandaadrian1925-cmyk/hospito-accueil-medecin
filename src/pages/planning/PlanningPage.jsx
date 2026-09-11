import { useEffect, useMemo, useState } from 'react';
import { Clock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { listerMedecinsActifs, enregistrerHorairesHabituels } from '../../services/planningService';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';

const JOURS = [
  { value: 'lundi', label: 'Lundi' }, { value: 'mardi', label: 'Mardi' }, { value: 'mercredi', label: 'Mercredi' },
  { value: 'jeudi', label: 'Jeudi' }, { value: 'vendredi', label: 'Vendredi' }, { value: 'samedi', label: 'Samedi' },
  { value: 'dimanche', label: 'Dimanche' },
];
const ORDRE_JOUR = JOURS.map((j) => j.value);

function EditeurHoraires({ medecin, etablissementId, actor, onEnregistre }) {
  const initial = {};
  (medecin.horairesHabituels || []).forEach((h) => { initial[h.jour] = { heureDebut: h.heureDebut, heureFin: h.heureFin }; });
  const [horaires, setHoraires] = useState(initial);
  const [saving, setSaving] = useState(false);

  const modifier = (jour, champ, valeur) => setHoraires((h) => ({ ...h, [jour]: { ...h[jour], [champ]: valeur } }));

  const enregistrer = async () => {
    const liste = JOURS.map((j) => ({ jour: j.value, ...horaires[j.value] })).filter((h) => h.heureDebut && h.heureFin);
    setSaving(true);
    try {
      await enregistrerHorairesHabituels(medecin.id, liste, etablissementId, actor);
      toast.success('Horaires enregistrés');
      onEnregistre();
    } catch (e) {
      toast.error(e.message || "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-3 py-2.5 rounded-lg bg-secondary/40 space-y-2">
      <p className="text-sm font-medium text-foreground">{medecin.nom}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {JOURS.map((j) => (
          <div key={j.value} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-muted-foreground flex-shrink-0">{j.label}</span>
            <input
              type="time"
              value={horaires[j.value]?.heureDebut || ''}
              onChange={(e) => modifier(j.value, 'heureDebut', e.target.value)}
              className="h-7 px-1.5 rounded-md border border-input bg-background text-xs w-24"
            />
            <span className="text-muted-foreground">à</span>
            <input
              type="time"
              value={horaires[j.value]?.heureFin || ''}
              onChange={(e) => modifier(j.value, 'heureFin', e.target.value)}
              className="h-7 px-1.5 rounded-md border border-input bg-background text-xs w-24"
            />
          </div>
        ))}
      </div>
      <Button size="sm" onClick={enregistrer} disabled={saving} className="gap-1.5">
        <Save size={13} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </div>
  );
}

function AfficheHoraires({ medecin }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-secondary/40">
      <p className="text-sm font-medium text-foreground mb-1.5">{medecin.nom}</p>
      {!medecin.horairesHabituels?.length ? (
        <p className="text-xs text-muted-foreground">Non renseignés.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {[...medecin.horairesHabituels].sort((a, b) => ORDRE_JOUR.indexOf(a.jour) - ORDRE_JOUR.indexOf(b.jour)).map((h, i) => (
            <span key={i} className="text-xs font-medium text-muted-foreground bg-background border border-border rounded-full px-2.5 py-1">
              {JOURS.find((j) => j.value === h.jour)?.label || h.jour} · {h.heureDebut}–{h.heureFin}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// #refonte (demande utilisateur, "efface la logique de planning du
// personnel actuelle... l'accueil de chaque service entre les horaires de
// travail générales de tous les médecins de son service et ça s'affiche
// directement chez l'admin ainsi que pour tous les autres services") :
// remplace l'ancienne vue lecture-seule d'un roster daté (géré côté
// hospito-admin) par la SAISIE des horaires hebdomadaires récurrents pour
// les médecins de SON service, et la consultation en lecture seule des
// autres services — tout le personnel actif de l'établissement est déjà
// lisible (cf. firestore.rules, affiliations.read), aucun changement de
// lecture nécessaire, seule l'écriture est désormais scopée au service de
// l'accueil (cf. règle étendue sur affiliations.update).
export default function PlanningPage() {
  const { user, userProfile, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const monServiceId = userProfile?.serviceId || null;

  const [medecins, setMedecins] = useState(null);

  const charger = () => listerMedecinsActifs(etablissementId).then(setMedecins).catch(() => setMedecins([]));
  useEffect(() => { if (etablissementId) charger(); }, [etablissementId]);

  const parService = useMemo(() => {
    const groupes = {};
    (medecins || []).forEach((m) => { (groupes[m.serviceId || 'sans-service'] ||= { serviceNom: m.service || 'Sans service', medecins: [] }).medecins.push(m); });
    return Object.entries(groupes).sort(([, a], [, b]) => a.serviceNom.localeCompare(b.serviceNom));
  }, [medecins]);

  if (medecins === null) return <Loader label="Chargement…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock size={22} className="text-primary" /> Horaires médecins
        </h1>
        <p className="text-muted-foreground mt-1">
          Horaires de travail habituels des médecins de l'établissement — vous ne pouvez saisir que ceux de votre propre service.
        </p>
      </div>

      {!parService.length ? (
        <EmptyState title="Aucun médecin" description="Aucun médecin actif n'a encore été affilié à cet établissement." />
      ) : (
        <div className="space-y-4">
          {parService.map(([serviceId, groupe]) => (
            <div key={serviceId} className="stat-card p-5 space-y-3">
              <h2 className="font-display font-semibold text-foreground">
                {groupe.serviceNom}
                {serviceId === monServiceId && <span className="text-xs font-normal text-primary ml-2">(votre service)</span>}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupe.medecins.map((m) => (
                  serviceId === monServiceId
                    ? <EditeurHoraires key={m.id} medecin={m} etablissementId={etablissementId} actor={actor} onEnregistre={charger} />
                    : <AfficheHoraires key={m.id} medecin={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

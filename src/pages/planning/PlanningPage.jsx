import { useEffect, useMemo, useState } from 'react';
import { Plus, Clock, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { hasPermission, messageErreurPermission } from '../../lib/permissions';
import {
  CRENEAUX, listenPlanning, creerCreneau, supprimerCreneau, listerMedecinsActifs,
} from '../../services/planningService';
import { listenServices } from '../../services/litsService';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';

const LABEL_CRENEAU = { matin: 'Matin', 'apres-midi': 'Après-midi', nuit: 'Nuit' };

const toISO = (d) => d.toISOString().slice(0, 10);
const aujourdHui = () => toISO(new Date());
const dansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISO(d);
};

// #nouveau (demande utilisateur, "c'est chaque accueil de chaque spécialité
// qui sait exactement quel médecin travaille tel jour") : le planning n'est
// plus géré uniquement de façon centralisée par un administrateur — chaque
// accueil (affilié à un service précis, cf. `service` sur son affiliation)
// gère ici directement le planning DE SES médecins. Même collection/règles
// que hospito-admin, juste un point d'entrée en plus, plus proche de qui
// détient réellement l'information.
export default function PlanningPage() {
  const { user, userProfile, etablissementId } = useAuth();
  const peutEcrire = hasPermission(userProfile, 'planning', 'write');
  const actor = { uid: user.uid, email: user.email };
  const monService = userProfile?.service || null;
  // #bug (corrigé, "les spécialistes sont directement assignés à des
  // services") : comparait auparavant des CHAÎNES (m.service === monService)
  // — un accent, une casse ou un service renommé cassait silencieusement le
  // filtre. serviceId référence un vrai document `services/{id}`, jamais un
  // texte libre (cf. hospito-admin, même modèle).
  const monServiceId = userProfile?.serviceId || null;

  const [planning, setPlanning] = useState(null);
  const [medecins, setMedecins] = useState([]);
  const [services, setServices] = useState([]);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [form, setForm] = useState({ personnelUid: '', serviceId: '', date: aujourdHui(), creneau: 'matin' });
  const [saving, setSaving] = useState(false);

  const dateDebut = aujourdHui();
  const dateFin = dansNJours(13);

  useEffect(() => listenPlanning(etablissementId, dateDebut, dateFin, setPlanning), [etablissementId]);
  useEffect(() => { listerMedecinsActifs(etablissementId).then(setMedecins).catch(() => setMedecins([])); }, [etablissementId]);
  useEffect(() => listenServices(etablissementId, setServices), [etablissementId]);

  // Ne propose par défaut que les médecins de SA spécialité — un accueil sans
  // service précisé (compte non scopé) continue de voir tout le monde.
  const medecinsDeMonService = useMemo(() => {
    if (!monServiceId) return medecins;
    const filtres = medecins.filter((m) => m.serviceId === monServiceId);
    return filtres.length ? filtres : medecins;
  }, [medecins, monServiceId]);

  const planningAffiche = useMemo(() => {
    if (!monServiceId) return planning || [];
    return (planning || []).filter((c) => !c.serviceId || c.serviceId === monServiceId);
  }, [planning, monServiceId]);

  const parJour = useMemo(() => {
    const groupes = {};
    planningAffiche.forEach((c) => { (groupes[c.date] ||= []).push(c); });
    return Object.entries(groupes).sort(([a], [b]) => a.localeCompare(b));
  }, [planningAffiche]);

  const ouvrirCreation = () => {
    setForm({ personnelUid: '', serviceId: monServiceId || '', date: aujourdHui(), creneau: 'matin' });
    setDialogOuvert(true);
  };

  const enregistrer = async () => {
    const membre = medecinsDeMonService.find((p) => p.uid === form.personnelUid);
    if (!membre || !form.date) { toast.error('Médecin et date requis'); return; }
    const service = services.find((s) => s.id === form.serviceId);
    setSaving(true);
    try {
      await creerCreneau({
        etablissementId, personnelUid: membre.uid, personnelNom: membre.nom,
        serviceId: service?.id, serviceNom: service?.nom, date: form.date, creneau: form.creneau,
      }, actor);
      toast.success('Créneau ajouté');
      setDialogOuvert(false);
    } catch (e) {
      toast.error(messageErreurPermission(e, 'planning'));
    } finally {
      setSaving(false);
    }
  };

  const retirer = async (creneauId) => {
    try {
      await supprimerCreneau(creneauId, etablissementId, actor);
    } catch (e) {
      toast.error(messageErreurPermission(e, 'planning'));
    }
  };

  if (planning === null) return <Loader label="Chargement du planning…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock size={22} className="text-primary" /> Planning des médecins
          </h1>
          <p className="text-muted-foreground mt-1">
            {monService ? `Créneaux de garde — ${monService}, 14 prochains jours.` : 'Créneaux de garde sur les 14 prochains jours.'}
          </p>
        </div>
        {peutEcrire && <Button onClick={ouvrirCreation} disabled={!medecinsDeMonService.length}><Plus size={16} /> Créneau</Button>}
      </div>

      {!parJour.length ? (
        <EmptyState title="Aucun créneau planifié" description="Les créneaux ajoutés pour les 14 prochains jours apparaîtront ici." />
      ) : (
        <div className="space-y-5">
          {parJour.map(([date, creneaux]) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-foreground mb-2">
                {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {creneaux.map((c) => (
                  <div key={c.id} className="glass-card-elevated p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm">{c.personnelNom}</p>
                      <p className="text-xs text-muted-foreground">{LABEL_CRENEAU[c.creneau]}{c.serviceNom ? ` · ${c.serviceNom}` : ''}</p>
                    </div>
                    {peutEcrire && (
                      <Button variant="ghost" size="sm" onClick={() => retirer(c.id)}><Trash2 size={14} /></Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOuvert} onOpenChange={setDialogOuvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau créneau</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Médecin</Label>
              <Select value={form.personnelUid} onValueChange={(v) => setForm({ ...form, personnelUid: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir un médecin" /></SelectTrigger>
                <SelectContent>
                  {medecinsDeMonService.map((p) => <SelectItem key={p.uid} value={p.uid}>{p.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service (optionnel)</Label>
              <Select value={form.serviceId} onValueChange={(v) => setForm({ ...form, serviceId: v })}>
                <SelectTrigger><SelectValue placeholder="Non précisé" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-date">Date</Label>
              <Input id="p-date" type="date" min={aujourdHui()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Créneau</Label>
              <Select value={form.creneau} onValueChange={(v) => setForm({ ...form, creneau: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRENEAUX.map((c) => <SelectItem key={c} value={c}>{LABEL_CRENEAU[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOuvert(false)}>Annuler</Button>
            <Button onClick={enregistrer} disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

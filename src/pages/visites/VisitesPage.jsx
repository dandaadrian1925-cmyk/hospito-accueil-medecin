import { useEffect, useState } from 'react';
import { HeartHandshake, Plus, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { listerAdmissionsActives } from '../../services/admissionsService';
import { listenVisitesEnCours, enregistrerArrivee, enregistrerDepart } from '../../services/visitesService';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';

export default function VisitesPage() {
  const { user, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };

  const [visites, setVisites] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [form, setForm] = useState({ admissionId: '', visiteurNom: '', lienParente: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => listenVisitesEnCours(etablissementId, setVisites), [etablissementId]);
  useEffect(() => { listerAdmissionsActives(etablissementId).then(setAdmissions).catch(() => setAdmissions([])); }, [etablissementId]);

  const ouvrirCreation = () => {
    setForm({ admissionId: '', visiteurNom: '', lienParente: '' });
    setDialogOuvert(true);
  };

  const enregistrer = async () => {
    const admission = admissions.find((a) => a.id === form.admissionId);
    if (!admission || !form.visiteurNom.trim()) { toast.error('Patient et nom du visiteur requis'); return; }
    setSaving(true);
    try {
      await enregistrerArrivee({
        etablissementId, admissionId: admission.id, patientNom: admission.patientNom,
        visiteurNom: form.visiteurNom, lienParente: form.lienParente,
      }, actor);
      toast.success('Visite enregistrée');
      setDialogOuvert(false);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const terminerVisite = async (v) => {
    try {
      await enregistrerDepart(v.id, etablissementId, actor);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    }
  };

  if (visites === null) return <Loader label="Chargement des visites…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <HeartHandshake size={22} className="text-primary" /> Visites
          </h1>
          <p className="text-muted-foreground mt-1">Visiteurs actuellement dans l'établissement.</p>
        </div>
        <Button onClick={ouvrirCreation} disabled={!admissions.length}><Plus size={16} /> Nouvelle visite</Button>
      </div>

      {!admissions.length && (
        <p className="text-sm text-muted-foreground">Aucun patient actuellement hospitalisé — une visite ne peut être déclarée que pour un patient admis.</p>
      )}

      {!visites.length ? (
        <EmptyState title="Aucune visite en cours" description="Les visiteurs enregistrés apparaîtront ici jusqu'à leur départ." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visites.map((v) => (
            <div key={v.id} className="glass-card-elevated p-4 space-y-2">
              <p className="font-semibold text-foreground">{v.visiteurNom}</p>
              <p className="text-sm text-muted-foreground">
                {v.lienParente ? `${v.lienParente} de ` : 'Visite '}{v.patientNom}
              </p>
              {v.heureArrivee?.toDate && (
                <p className="text-xs text-muted-foreground">Arrivée : {v.heureArrivee.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
              )}
              <Button variant="outline" size="sm" onClick={() => terminerVisite(v)}><LogOut size={14} /> Marquer le départ</Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOuvert} onOpenChange={setDialogOuvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle visite</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Patient visité</Label>
              <Select value={form.admissionId} onValueChange={(v) => setForm({ ...form, admissionId: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un patient hospitalisé" /></SelectTrigger>
                <SelectContent>
                  {admissions.map((a) => <SelectItem key={a.id} value={a.id}>{a.patientNom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-nom">Nom du visiteur</Label>
              <Input id="v-nom" value={form.visiteurNom} onChange={(e) => setForm({ ...form, visiteurNom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-lien">Lien de parenté (optionnel)</Label>
              <Input id="v-lien" value={form.lienParente} onChange={(e) => setForm({ ...form, lienParente: e.target.value })} placeholder="Ex : Époux, Fille…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOuvert(false)}>Annuler</Button>
            <Button onClick={enregistrer} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

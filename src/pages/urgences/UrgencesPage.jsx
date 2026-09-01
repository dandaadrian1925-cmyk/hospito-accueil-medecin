import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { Siren, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { buildPatientsQuery } from '../../services/patientsService';
import { NIVEAUX_TRIAGE, listenUrgences, enregistrerArrivee, prendreEnCharge, cloturer } from '../../services/urgencesService';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';

const TONE_TRIAGE = { 1: 'red', 2: 'red', 3: 'amber', 4: 'blue', 5: 'gray' };
const TONE_STATUT = { en_attente: 'amber', en_consultation: 'blue', traite: 'green', transfere: 'gray' };
const LABEL_STATUT = { en_attente: 'En attente', en_consultation: 'En consultation', traite: 'Traité', transfere: 'Transféré' };

export default function UrgencesPage() {
  const { user, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };

  const [urgences, setUrgences] = useState(null);
  const [patients, setPatients] = useState([]);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [form, setForm] = useState({ patientId: '', niveauTriage: '3', motif: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!etablissementId) return;
    return listenUrgences(etablissementId, setUrgences);
  }, [etablissementId]);

  useEffect(() => {
    if (!etablissementId) return;
    getDocs(buildPatientsQuery(etablissementId)).then((snap) => setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [etablissementId]);

  const enregistrer = async () => {
    const patient = patients.find((p) => p.id === form.patientId);
    if (!patient) { toast.error('Sélectionnez un patient'); return; }
    setSaving(true);
    try {
      await enregistrerArrivee({ ...form, patientNom: `${patient.prenom} ${patient.nom}` }, etablissementId, actor);
      toast.success('Arrivée enregistrée');
      setDialogOuvert(false);
      setForm({ patientId: '', niveauTriage: '3', motif: '' });
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const gererPriseEnCharge = async (urgence) => {
    try {
      await prendreEnCharge(urgence.id, etablissementId, actor);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    }
  };

  const gererCloture = async (urgence, statut) => {
    try {
      await cloturer(urgence.id, statut, etablissementId, actor);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    }
  };

  const columns = [
    { key: 'niveauTriage', label: 'Triage', render: (u) => <StatusBadge label={`Niveau ${u.niveauTriage}`} tone={TONE_TRIAGE[u.niveauTriage]} /> },
    { key: 'patientNom', label: 'Patient' },
    { key: 'motif', label: 'Motif', render: (u) => u.motif || '—' },
    { key: 'heureArrivee', label: 'Arrivée', render: (u) => u.heureArrivee?.toDate ? u.heureArrivee.toDate().toLocaleTimeString('fr-FR') : '—' },
    { key: 'statut', label: 'Statut', render: (u) => <StatusBadge label={LABEL_STATUT[u.statut]} tone={TONE_STATUT[u.statut]} /> },
    {
      key: 'actions', label: 'Actions',
      render: (u) => (
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {u.statut === 'en_attente' && <Button size="sm" onClick={() => gererPriseEnCharge(u)}>Prendre en charge</Button>}
          {u.statut === 'en_consultation' && (
            <>
              <Button variant="outline" size="sm" onClick={() => gererCloture(u, 'traite')}>Traité</Button>
              <Button variant="outline" size="sm" onClick={() => gererCloture(u, 'transfere')}>Transférer</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Siren size={22} className="text-primary" /> Urgences
          </h1>
          <p className="text-muted-foreground mt-1">File d'attente triée par niveau de gravité, puis ordre d'arrivée.</p>
        </div>
        <Button onClick={() => setDialogOuvert(true)}><Plus size={16} /> Enregistrer une arrivée</Button>
      </div>

      <DataTable columns={columns} rows={urgences || []} loading={urgences === null} emptyTitle="Aucun passage aux urgences" />

      <Dialog open={dialogOuvert} onOpenChange={setDialogOuvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enregistrer une arrivée</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Patient</Label>
              <Select value={form.patientId} onValueChange={(v) => setForm({ ...form, patientId: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un patient" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.prenom} {p.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Niveau de triage (1 = vital, 5 = à différer)</Label>
              <Select value={form.niveauTriage} onValueChange={(v) => setForm({ ...form, niveauTriage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NIVEAUX_TRIAGE.map((n) => <SelectItem key={n} value={String(n)}>Niveau {n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Motif</Label>
              <Input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder="Ex : douleur thoracique…" />
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

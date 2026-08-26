import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { UserPlus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { buildPatientsQuery } from '../../services/patientsService';
import { STATUTS_ADMISSION, buildAdmissionsQuery, creerAdmission, changerStatutAdmission } from '../../services/admissionsService';
import { useFirestorePagination } from '../../hooks/useFirestorePagination';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';

const TONE_STATUT = { pre_admission: 'amber', admis: 'green', sorti: 'gray', transfere: 'blue' };
const LABEL_STATUT = { pre_admission: 'Pré-admission', admis: 'Admis', sorti: 'Sorti', transfere: 'Transféré' };

export default function AdmissionsPage() {
  const { user, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const pagination = useFirestorePagination(() => buildAdmissionsQuery(etablissementId), [etablissementId]);

  const [patients, setPatients] = useState([]);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [form, setForm] = useState({ patientId: '', service: '', dateSortiePrevue: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!etablissementId) return;
    getDocs(buildPatientsQuery(etablissementId)).then((snap) => setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [etablissementId]);

  const admettre = async () => {
    const patient = patients.find((p) => p.id === form.patientId);
    if (!patient) { toast.error('Sélectionnez un patient'); return; }
    setSaving(true);
    try {
      await creerAdmission({ ...form, patientNom: `${patient.prenom} ${patient.nom}` }, etablissementId, actor);
      toast.success('Admission créée');
      setDialogOuvert(false);
      setForm({ patientId: '', service: '', dateSortiePrevue: '' });
      pagination.refresh();
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const changerStatut = async (admission, statut) => {
    try {
      await changerStatutAdmission(admission.id, statut, etablissementId, actor);
      pagination.refresh();
    } catch (e) {
      toast.error(e.message || 'Erreur');
    }
  };

  const columns = [
    { key: 'patientNom', label: 'Patient' },
    { key: 'service', label: 'Service', render: (a) => a.service || '—' },
    { key: 'statut', label: 'Statut', render: (a) => <StatusBadge label={LABEL_STATUT[a.statut]} tone={TONE_STATUT[a.statut]} /> },
    {
      key: 'actions', label: 'Actions',
      render: (a) => (
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {STATUTS_ADMISSION.filter((s) => s !== a.statut).map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => changerStatut(a, s)}>{LABEL_STATUT[s]}</Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <UserPlus size={22} className="text-primary" /> Admissions
          </h1>
          <p className="text-muted-foreground mt-1">Pré-admission, admission, sortie, transfert.</p>
        </div>
        <Button onClick={() => setDialogOuvert(true)}><Plus size={16} /> Nouvelle admission</Button>
      </div>

      <DataTable columns={columns} rows={pagination.rows} loading={pagination.loading} emptyTitle="Aucune admission" pagination={pagination} />

      <Dialog open={dialogOuvert} onOpenChange={setDialogOuvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle admission</DialogTitle></DialogHeader>
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
              <Label>Service</Label>
              <Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Cardiologie…" />
            </div>
            <div className="space-y-1.5">
              <Label>Date de sortie prévue (optionnel)</Label>
              <Input type="date" value={form.dateSortiePrevue} onChange={(e) => setForm({ ...form, dateSortiePrevue: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOuvert(false)}>Annuler</Button>
            <Button onClick={admettre} disabled={saving}>{saving ? 'Création…' : 'Créer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

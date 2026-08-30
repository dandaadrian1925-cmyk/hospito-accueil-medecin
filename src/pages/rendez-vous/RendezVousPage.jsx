import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { CalendarClock, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { buildPatientsQuery } from '../../services/patientsService';
import { listenServices } from '../../services/litsService';
import { STATUTS_RDV, buildRendezVousQuery, creerRendezVous, changerStatutRendezVous } from '../../services/rendezVousService';
import { useFirestorePagination } from '../../hooks/useFirestorePagination';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';

const TONE_STATUT = { planifie: 'amber', confirme: 'blue', annule: 'red', termine: 'green' };
const LABEL_STATUT = { planifie: 'Planifié', confirme: 'Confirmé', annule: 'Annulé', termine: 'Terminé' };

export default function RendezVousPage() {
  const { user, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const pagination = useFirestorePagination(() => buildRendezVousQuery(etablissementId), [etablissementId]);

  const [patients, setPatients] = useState([]);
  const [services, setServices] = useState([]);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [form, setForm] = useState({ patientId: '', serviceId: '', dateHeure: '', motif: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!etablissementId) return;
    getDocs(buildPatientsQuery(etablissementId)).then((snap) => setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [etablissementId]);

  useEffect(() => {
    if (!etablissementId) return;
    return listenServices(etablissementId, (all) => setServices(all.filter((s) => s.actif)));
  }, [etablissementId]);

  const creer = async () => {
    const patient = patients.find((p) => p.id === form.patientId);
    const service = services.find((s) => s.id === form.serviceId);
    if (!patient || !form.dateHeure) { toast.error('Patient et date/heure requis'); return; }
    setSaving(true);
    try {
      await creerRendezVous({
        patientId: form.patientId, serviceId: form.serviceId || null, service: service?.nom || null,
        dateHeure: form.dateHeure, motif: form.motif, patientNom: `${patient.prenom} ${patient.nom}`,
      }, etablissementId, actor);
      toast.success('Rendez-vous créé');
      setDialogOuvert(false);
      setForm({ patientId: '', serviceId: '', dateHeure: '', motif: '' });
      pagination.refresh();
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const changerStatut = async (rdv, statut) => {
    try {
      await changerStatutRendezVous(rdv.id, statut, etablissementId, actor);
      pagination.refresh();
    } catch (e) {
      toast.error(e.message || 'Erreur');
    }
  };

  const columns = [
    { key: 'dateHeure', label: 'Date / heure', render: (r) => r.dateHeure?.toDate ? r.dateHeure.toDate().toLocaleString('fr-FR') : '—' },
    { key: 'patientNom', label: 'Patient' },
    { key: 'service', label: 'Service', render: (r) => r.service || '—' },
    { key: 'motif', label: 'Motif', render: (r) => r.motif || '—' },
    { key: 'statut', label: 'Statut', render: (r) => <StatusBadge label={LABEL_STATUT[r.statut]} tone={TONE_STATUT[r.statut]} /> },
    {
      key: 'actions', label: 'Actions',
      render: (r) => (
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {STATUTS_RDV.filter((s) => s !== r.statut).map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => changerStatut(r, s)}>{LABEL_STATUT[s]}</Button>
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
            <CalendarClock size={22} className="text-primary" /> Rendez-vous
          </h1>
          <p className="text-muted-foreground mt-1">Prise au guichet, annulation, report.</p>
        </div>
        <Button onClick={() => setDialogOuvert(true)}><Plus size={16} /> Nouveau rendez-vous</Button>
      </div>

      <DataTable columns={columns} rows={pagination.rows} loading={pagination.loading} emptyTitle="Aucun rendez-vous" pagination={pagination} />

      <Dialog open={dialogOuvert} onOpenChange={setDialogOuvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau rendez-vous</DialogTitle></DialogHeader>
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
              <Select value={form.serviceId} onValueChange={(v) => setForm({ ...form, serviceId: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un service" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date et heure</Label>
              <Input type="datetime-local" value={form.dateHeure} onChange={(e) => setForm({ ...form, dateHeure: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Motif</Label>
              <Input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOuvert(false)}>Annuler</Button>
            <Button onClick={creer} disabled={saving}>{saving ? 'Création…' : 'Créer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

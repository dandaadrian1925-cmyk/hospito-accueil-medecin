import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { UserPlus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { buildPatientsQuery } from '../../services/patientsService';
import { listenServices } from '../../services/litsService';
import { buildAdmissionsQuery, admettre, sortir } from '../../services/admissionsService';
import { useFirestorePagination } from '../../hooks/useFirestorePagination';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';

const TONE_STATUT = { admis: 'green', sorti: 'gray' };
const LABEL_STATUT = { admis: 'Admis', sorti: 'Sorti' };

// #corrigé (audit, "creerAdmission/changerStatutAdmission — schéma Phase 0/1
// jamais mis à jour après la refonte ADT de hospito-admin") : reprend le
// même schéma canonique (serviceId réel, statuts 'admis'/'sorti' seulement,
// compte-rendu de sortie) que hospito-admin/PatientDetailPage.jsx.
export default function AdmissionsPage() {
  const { user, userProfile, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const pagination = useFirestorePagination(() => buildAdmissionsQuery(etablissementId), [etablissementId]);

  const [patients, setPatients] = useState([]);
  const [tousLesServices, setTousLesServices] = useState([]);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [form, setForm] = useState({ patientId: '', serviceId: '', motif: '' });
  const [saving, setSaving] = useState(false);
  const [sortieEnCours, setSortieEnCours] = useState(null);
  const [compteRenduSortie, setCompteRenduSortie] = useState('');

  useEffect(() => {
    if (!etablissementId) return;
    getDocs(buildPatientsQuery(etablissementId)).then((snap) => setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [etablissementId]);
  useEffect(() => listenServices(etablissementId, setTousLesServices), [etablissementId]);

  // Même convention que Billet de consultation/Rendez-vous : un compte
  // accueil géré par un seul service se le voit présélectionné.
  const monServiceId = userProfile?.serviceId;
  const services = monServiceId ? tousLesServices.filter((s) => s.id === monServiceId) : tousLesServices;
  useEffect(() => {
    if (services.length === 1 && form.serviceId !== services[0].id) setForm((f) => ({ ...f, serviceId: services[0].id }));
  }, [services]);

  const creer = async () => {
    const patient = patients.find((p) => p.id === form.patientId);
    const service = services.find((s) => s.id === form.serviceId);
    if (!patient || !service) { toast.error('Patient et service requis'); return; }
    setSaving(true);
    try {
      await admettre({
        patientId: form.patientId, patientNom: `${patient.prenom} ${patient.nom}`,
        serviceId: service.id, serviceNom: service.nom, motif: form.motif,
      }, etablissementId, actor);
      toast.success('Admission créée');
      setDialogOuvert(false);
      setForm({ patientId: '', serviceId: '', motif: '' });
      pagination.refresh();
    } catch (e) {
      toast.error(e.message === 'ADMISSION_DEJA_ACTIVE' ? 'Ce patient a déjà une admission active' : (e.message || 'Erreur'));
    } finally {
      setSaving(false);
    }
  };

  const confirmerSortie = async () => {
    setSaving(true);
    try {
      await sortir(sortieEnCours.id, compteRenduSortie, etablissementId, actor);
      toast.success('Sortie enregistrée');
      setSortieEnCours(null);
      setCompteRenduSortie('');
      pagination.refresh();
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'patientNom', label: 'Patient' },
    { key: 'serviceNom', label: 'Service', render: (a) => a.serviceNom || '—' },
    { key: 'statut', label: 'Statut', render: (a) => <StatusBadge label={LABEL_STATUT[a.statut]} tone={TONE_STATUT[a.statut]} /> },
    {
      key: 'actions', label: 'Actions',
      render: (a) => a.statut !== 'admis' ? null : (
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" onClick={() => { setSortieEnCours(a); setCompteRenduSortie(''); }}>Sortir</Button>
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
          <p className="text-muted-foreground mt-1">Admission et sortie.</p>
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
              {services.length === 1 ? (
                <div className="h-10 px-3 flex items-center rounded-md border border-input bg-secondary/40 text-sm text-foreground">
                  {services[0].nom}
                </div>
              ) : (
                <Select value={form.serviceId} onValueChange={(v) => setForm({ ...form, serviceId: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un service" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Motif (optionnel)</Label>
              <Input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOuvert(false)}>Annuler</Button>
            <Button onClick={creer} disabled={saving}>{saving ? 'Création…' : 'Créer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sortieEnCours} onOpenChange={(open) => !open && setSortieEnCours(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sortie de {sortieEnCours?.patientNom}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Compte-rendu de sortie (optionnel)</Label>
            <Textarea value={compteRenduSortie} onChange={(e) => setCompteRenduSortie(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSortieEnCours(null)}>Annuler</Button>
            <Button onClick={confirmerSortie} disabled={saving}>{saving ? 'Enregistrement…' : 'Confirmer la sortie'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

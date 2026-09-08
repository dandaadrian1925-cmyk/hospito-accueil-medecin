import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { CalendarClock, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { buildPatientsQuery } from '../../services/patientsService';
import { listenServices } from '../../services/litsService';
import { STATUTS_RDV, buildRendezVousQuery, creerRendezVous, changerStatutRendezVous } from '../../services/rendezVousService';
import {
  listenDemandesEnAttente, confirmerDemande, refuserDemande, listerMedecins,
} from '../../services/demandesRendezVousService';
import { listerMedecinsDeGarde, creneauDepuisHeure } from '../../services/planningService';
import { useFirestorePagination } from '../../hooks/useFirestorePagination';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';

const TONE_STATUT = { planifie: 'amber', confirme: 'blue', annule: 'red', termine: 'green' };
const LABEL_STATUT = { planifie: 'Planifié', confirme: 'Confirmé', annule: 'Annulé', termine: 'Terminé' };

function DemandesEnLigneSection({ etablissementId, actor, monServiceId }) {
  const [toutesLesDemandes, setToutesLesDemandes] = useState(null);
  const [medecins, setMedecins] = useState([]);
  const [demandeEnCours, setDemandeEnCours] = useState(null);
  const [form, setForm] = useState({ medecinId: '', dateHeure: '' });
  const [saving, setSaving] = useState(false);
  // Filtrage par planning (garde du jour/créneau choisi) — null tant qu'aucune
  // date/heure n'est renseignée ou que la vérification est en cours ; repasse
  // à la liste complète des médecins si personne n'est explicitement de garde
  // (planning pas encore renseigné pour cet établissement), pour ne jamais
  // bloquer la confirmation faute de données.
  const [medecinsDeGarde, setMedecinsDeGarde] = useState(null);

  useEffect(() => listenDemandesEnAttente(etablissementId, setToutesLesDemandes), [etablissementId]);
  useEffect(() => { listerMedecins(etablissementId).then(setMedecins).catch(() => setMedecins([])); }, [etablissementId]);

  // #nouveau (demande utilisateur, "l'accueil en charge du service choisi et
  // pas les autres accueils voit ma demande") : listenDemandesEnAttente ne
  // filtre que par établissement — un accueil ne doit voir que les demandes
  // de SON service (serviceId, réglé depuis hospito-admin). Filtrage client,
  // même principe que BilletsSessionPage.jsx.
  const demandes = monServiceId
    ? (toutesLesDemandes?.filter((d) => d.serviceId === monServiceId) ?? null)
    : toutesLesDemandes;

  useEffect(() => {
    if (!form.dateHeure) { setMedecinsDeGarde(null); return; }
    const dateObj = new Date(form.dateHeure);
    const date = form.dateHeure.slice(0, 10);
    const creneau = creneauDepuisHeure(dateObj.getHours());
    let annule = false;
    listerMedecinsDeGarde(etablissementId, date, creneau, demandeEnCours?.serviceId).then((uids) => {
      if (!annule) setMedecinsDeGarde(uids);
    }).catch(() => { if (!annule) setMedecinsDeGarde(null); });
    return () => { annule = true; };
  }, [etablissementId, form.dateHeure, demandeEnCours?.serviceId]);

  const medecinsProposes = medecinsDeGarde?.size ? medecins.filter((m) => medecinsDeGarde.has(m.uid)) : medecins;
  const planningRenseigne = !!medecinsDeGarde?.size;

  const ouvrirConfirmation = (d) => {
    setDemandeEnCours(d);
    // Préremplit avec la préférence du patient (choisie parmi les
    // spécialistes de garde côté hospito-patient) — une suggestion, pas une
    // affectation : l'accueil reste libre de changer avant de confirmer.
    setForm({
      medecinId: d.medecinPrefereId || '',
      dateHeure: d.dateSouhaitee ? `${d.dateSouhaitee}T09:00` : '',
    });
    setMedecinsDeGarde(null);
  };

  const confirmer = async () => {
    if (!form.dateHeure || (demandeEnCours.type === 'teleconsultation' && !form.medecinId)) {
      toast.error(demandeEnCours.type === 'teleconsultation' ? 'Médecin et date/heure requis pour une téléconsultation' : 'Date/heure requise');
      return;
    }
    const medecin = medecins.find((m) => m.uid === form.medecinId);
    setSaving(true);
    try {
      await confirmerDemande(demandeEnCours.id, { medecinId: medecin?.uid, medecinNom: medecin?.nom, dateHeure: form.dateHeure }, etablissementId, actor);
      toast.success('Demande confirmée');
      setDemandeEnCours(null);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const refuser = async (d) => {
    try {
      await refuserDemande(d.id, etablissementId, actor);
      toast.success('Demande refusée');
    } catch (e) {
      toast.error(e.message || 'Erreur');
    }
  };

  if (demandes === null) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-foreground">Demandes en ligne</h2>
      {!demandes.length ? (
        <EmptyState title="Aucune demande en attente" description="Les demandes soumises depuis l'app patient apparaîtront ici." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {demandes.map((d) => (
            <div key={d.id} className="glass-card-elevated p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{d.patientNom}</span>
                {d.type === 'teleconsultation' && <StatusBadge label="Téléconsultation" tone="blue" />}
              </div>
              <p className="text-sm text-muted-foreground">{d.motif}</p>
              {d.serviceNom && <p className="text-xs text-muted-foreground">{d.serviceNom}</p>}
              {d.medecinPrefereNom && (
                <p className="text-xs text-primary font-medium">Préférence : Dr {d.medecinPrefereNom}{d.dateSouhaitee ? ` — ${new Date(d.dateSouhaitee).toLocaleDateString('fr-FR', { dateStyle: 'medium' })}` : ''}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => ouvrirConfirmation(d)}>Confirmer</Button>
                <Button size="sm" variant="ghost" onClick={() => refuser(d)}>Refuser</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!demandeEnCours} onOpenChange={(open) => !open && setDemandeEnCours(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmer la demande</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Date et heure</Label>
              <Input type="datetime-local" value={form.dateHeure} onChange={(e) => setForm({ ...form, dateHeure: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Médecin{demandeEnCours?.type === 'teleconsultation' ? '' : ' (optionnel)'}</Label>
              <Select value={form.medecinId} onValueChange={(v) => setForm({ ...form, medecinId: v })}>
                <SelectTrigger><SelectValue placeholder="Assigner un médecin" /></SelectTrigger>
                <SelectContent>
                  {medecinsProposes.map((m) => <SelectItem key={m.uid} value={m.uid}>{m.nom}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.dateHeure && (
                <p className="text-xs text-muted-foreground">
                  {planningRenseigne
                    ? 'Médecins de garde sur ce créneau, d\'après le planning.'
                    : 'Aucun planning renseigné pour ce créneau — tous les médecins de l\'établissement sont proposés.'}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemandeEnCours(null)}>Annuler</Button>
            <Button onClick={confirmer} disabled={saving}>{saving ? 'Confirmation…' : 'Confirmer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RendezVousPage() {
  const { user, userProfile, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const pagination = useFirestorePagination(() => buildRendezVousQuery(etablissementId), [etablissementId]);

  const [patients, setPatients] = useState([]);
  const [servicesActifs, setServicesActifs] = useState([]);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [form, setForm] = useState({ patientId: '', serviceId: '', dateHeure: '', motif: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!etablissementId) return;
    getDocs(buildPatientsQuery(etablissementId)).then((snap) => setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [etablissementId]);

  useEffect(() => {
    if (!etablissementId) return;
    return listenServices(etablissementId, (all) => setServicesActifs(all.filter((s) => s.actif)));
  }, [etablissementId]);

  // Même logique que Billet de session : un accueil ne peut créer un RDV au
  // guichet que pour SON service (serviceId, toujours renseigné).
  const monServiceId = userProfile?.serviceId;
  const services = monServiceId ? servicesActifs.filter((s) => s.id === monServiceId) : servicesActifs;
  useEffect(() => {
    if (services.length === 1 && form.serviceId !== services[0].id) setForm((f) => ({ ...f, serviceId: services[0].id }));
  }, [services]);

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

      <DemandesEnLigneSection etablissementId={etablissementId} actor={actor} monServiceId={monServiceId} />

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

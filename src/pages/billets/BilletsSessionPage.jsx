import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Activity, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { buildPatientsQuery } from '../../services/patientsService';
import { listenServices } from '../../services/litsService';
import { listerMedecinsDuService } from '../../services/demandesRendezVousService';
import { listenBilletsDuJour, creerBillet, saisirParametres } from '../../services/billetsSessionService';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../../components/ui/select';

const LABEL_STATUT = { a_payer: 'À payer', arrive: 'En attente des paramètres', pret: 'Prêt pour consultation', consulte: 'Consulté' };
const TONE_STATUT = { a_payer: 'amber', arrive: 'blue', pret: 'green', consulte: 'gray' };
const PARAMETRES_VIDE = { temperature: '', tension: '', poids: '', pouls: '' };

// Insensible aux accents/casse — "Ndongo" doit retrouver "N'Dongo" ou "NDONGO".
const normaliser = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function BilletsSessionPage() {
  const { user, userProfile, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };

  const [patients, setPatients] = useState([]);
  const [tousLesServices, setTousLesServices] = useState([]);
  const [billets, setBillets] = useState(null);
  const [patientSelectionne, setPatientSelectionne] = useState(null);
  const [rechercheNom, setRechercheNom] = useState('');
  const [rechercheNaissance, setRechercheNaissance] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [medecins, setMedecins] = useState([]);
  const [medecinId, setMedecinId] = useState('');
  const [creation, setCreation] = useState(false);
  const [billetOuvert, setBilletOuvert] = useState(null);
  const [parametres, setParametres] = useState(PARAMETRES_VIDE);
  const [savingParametres, setSavingParametres] = useState(false);

  useEffect(() => {
    if (!etablissementId) return;
    getDocs(buildPatientsQuery(etablissementId)).then((snap) => setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [etablissementId]);
  useEffect(() => listenServices(etablissementId, setTousLesServices), [etablissementId]);

  // Chaque compte accueil gère toujours exactement un service (serviceId,
  // réglé depuis hospito-admin) — plus besoin de le choisir à chaque billet,
  // il est présélectionné automatiquement.
  const monServiceId = userProfile?.serviceId;
  const services = monServiceId ? tousLesServices.filter((s) => s.id === monServiceId) : tousLesServices;
  useEffect(() => {
    if (services.length === 1 && serviceId !== services[0].id) setServiceId(services[0].id);
  }, [services]);
  useEffect(() => listenBilletsDuJour(etablissementId, setBillets), [etablissementId]);

  // #nouveau (demande utilisateur, "la liste des patients mais avec la barre
  // de recherche pour filtrer") : liste complète visible, filtrée en direct
  // par nom et/ou date de naissance — pas un menu déroulant de tout
  // l'établissement, mais pas non plus masquée tant qu'on n'a rien tapé.
  const patientsFiltres = useMemo(() => {
    const nomCherche = normaliser(rechercheNom);
    return patients
      .filter((p) => !nomCherche || normaliser(`${p.prenom} ${p.nom}`).includes(nomCherche))
      .filter((p) => !rechercheNaissance || p.dateNaissance === rechercheNaissance)
      .sort((a, b) => `${a.prenom}${a.nom}`.localeCompare(`${b.prenom}${b.nom}`));
  }, [patients, rechercheNom, rechercheNaissance]);

  // #nouveau (demande utilisateur, "billet lié à UN médecin précis") :
  // proposé UNE FOIS le service choisi, jamais obligatoire (un billet sans
  // médecin reste visible par tout le service, comportement historique).
  useEffect(() => {
    setMedecinId('');
    if (!serviceId || !etablissementId) { setMedecins([]); return; }
    listerMedecinsDuService(etablissementId, serviceId).then(setMedecins).catch(() => setMedecins([]));
  }, [serviceId, etablissementId]);

  const creer = async () => {
    const service = services.find((s) => s.id === serviceId);
    const medecin = medecins.find((m) => m.uid === medecinId);
    if (!patientSelectionne || !service) { toast.error('Patient et service requis'); return; }
    setCreation(true);
    try {
      const { statut } = await creerBillet(
        {
          patientId: patientSelectionne.id, patientNom: `${patientSelectionne.prenom} ${patientSelectionne.nom}`, serviceId: service.id, serviceNom: service.nom,
          medecinId: medecin?.uid, medecinNom: medecin?.nom,
        },
        etablissementId, actor,
      );
      if (statut === 'a_payer') {
        toast('Facture créée — orientez le patient vers Paiement au guichet', { icon: '🎫', duration: 6000 });
      } else {
        toast.success('Billet enregistré — vous pouvez saisir les paramètres');
      }
      setPatientSelectionne(null);
      setRechercheNom('');
      setRechercheNaissance('');
      setServiceId('');
    } catch (e) {
      toast.error(e.message === 'BILLET_NON_EXPIRE'
        ? 'Ce patient a déjà un billet actif aujourd\'hui — retrouvez-le dans la liste ci-dessous plutôt que d\'en recréer un.'
        : (e.message || 'Erreur'));
    } finally {
      setCreation(false);
    }
  };

  const ouvrirParametres = (billet) => {
    setBilletOuvert(billet);
    setParametres(billet.parametres || PARAMETRES_VIDE);
  };

  const enregistrerParametres = async () => {
    setSavingParametres(true);
    try {
      await saisirParametres(billetOuvert.id, parametres, etablissementId, actor);
      toast.success('Paramètres enregistrés');
      setBilletOuvert(null);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSavingParametres(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Ticket size={22} className="text-primary" /> Billet de consultation
        </h1>
        <p className="text-muted-foreground mt-1">
          Check-in d'un patient qui se présente — si le service choisi a un tarif de consultation, une facture est créée automatiquement.
        </p>
      </div>

      <div className="glass-card-elevated p-4 space-y-3">
        <div className="space-y-1.5">
          <Label>Patient</Label>
          {patientSelectionne ? (
            <div className="h-10 px-3 flex items-center justify-between rounded-md border border-input bg-secondary/40 text-sm text-foreground">
              <span className="font-medium">{patientSelectionne.prenom} {patientSelectionne.nom}{patientSelectionne.dateNaissance ? ` · né(e) le ${new Date(`${patientSelectionne.dateNaissance}T00:00:00`).toLocaleDateString('fr-FR')}` : ''}</span>
              <button type="button" onClick={() => setPatientSelectionne(null)} className="text-muted-foreground hover:text-foreground">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Filtrer par nom complet…" value={rechercheNom} onChange={(e) => setRechercheNom(e.target.value)} />
                </div>
                <Input type="date" value={rechercheNaissance} onChange={(e) => setRechercheNaissance(e.target.value)} />
              </div>
              <div className="border border-border rounded-lg max-h-64 overflow-y-auto divide-y divide-border/50">
                {patientsFiltres.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Aucun patient ne correspond.</p>
                ) : patientsFiltres.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setPatientSelectionne(p); setRechercheNom(''); setRechercheNaissance(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60"
                  >
                    <span className="font-medium text-foreground">{p.prenom} {p.nom}</span>
                    {p.dateNaissance && <span className="text-muted-foreground"> · né(e) le {new Date(`${p.dateNaissance}T00:00:00`).toLocaleDateString('fr-FR')}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Service</Label>
          {services.length === 1 ? (
            <div className="h-10 px-3 flex items-center rounded-md border border-input bg-secondary/40 text-sm text-foreground">
              {services[0].nom}
            </div>
          ) : (
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un service" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        {!!serviceId && (
          <div className="space-y-1.5">
            <Label>Médecin (optionnel — sinon visible par tout le service)</Label>
            <Select value={medecinId} onValueChange={setMedecinId} disabled={!medecins.length}>
              <SelectTrigger><SelectValue placeholder={medecins.length ? 'Assigner à un médecin précis' : 'Aucun médecin dans ce service'} /></SelectTrigger>
              <SelectContent>
                {medecins.map((m) => <SelectItem key={m.uid} value={m.uid}>Dr {m.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={creer} disabled={creation}>{creation ? 'Création…' : 'Créer le billet'}</Button>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Billets du jour</h2>
        {billets === null ? <Loader label="Chargement…" /> : !billets.length ? (
          <EmptyState title="Aucun billet aujourd'hui" description="Les patients accueillis aujourd'hui apparaîtront ici." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {billets.map((b) => (
              <div key={b.id} className="glass-card-elevated p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{b.patientNom}</span>
                  <StatusBadge label={LABEL_STATUT[b.statut]} tone={TONE_STATUT[b.statut]} />
                </div>
                <p className="text-sm text-muted-foreground">{b.serviceNom}</p>
                {b.statut === 'a_payer' && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/paiement">Aller à Paiement au guichet</Link>
                  </Button>
                )}
                {b.statut !== 'a_payer' && (
                  <div>
                    {b.parametres ? (
                      <p className="text-xs text-muted-foreground">
                        {b.parametres.temperature && `${b.parametres.temperature}°C · `}
                        {b.parametres.tension && `${b.parametres.tension} · `}
                        {b.parametres.poids && `${b.parametres.poids}kg`}
                      </p>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => ouvrirParametres(b)}>
                        <Activity size={14} /> Saisir les paramètres
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {billetOuvert && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBilletOuvert(null)}>
          <div className="bg-background rounded-xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-foreground">Paramètres — {billetOuvert.patientNom}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Température (°C)</Label>
                <Input value={parametres.temperature} onChange={(e) => setParametres({ ...parametres, temperature: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tension</Label>
                <Input value={parametres.tension} onChange={(e) => setParametres({ ...parametres, tension: e.target.value })} placeholder="120/80" />
              </div>
              <div className="space-y-1.5">
                <Label>Poids (kg)</Label>
                <Input value={parametres.poids} onChange={(e) => setParametres({ ...parametres, poids: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Pouls (bpm)</Label>
                <Input value={parametres.pouls} onChange={(e) => setParametres({ ...parametres, pouls: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setBilletOuvert(null)}>Annuler</Button>
              <Button onClick={enregistrerParametres} disabled={savingParametres}>{savingParametres ? 'Enregistrement…' : 'Enregistrer'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

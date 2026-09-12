import { useEffect, useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { chargerHistoriqueRdv } from '../../services/historiqueService';
import { listerMedecinsDuService } from '../../services/demandesRendezVousService';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Loader from '../../components/common/Loader';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';

const LABEL_STATUT = {
  planifie: 'Planifié', confirme: 'Confirmé', annule: 'Annulé', termine: 'Terminé', absent: 'Non honoré',
  teleconsultation: 'Téléconsultation', en_attente: 'Demande en attente', refuse: 'Demande refusée',
};
const TONE_STATUT = {
  planifie: 'amber', confirme: 'blue', annule: 'red', termine: 'green', absent: 'red',
  teleconsultation: 'blue', en_attente: 'amber', refuse: 'red',
};

const ilYA = (jours) => {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
};
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// #nouveau (demande utilisateur, "une ligne Historique dans la sidebar pour
// afficher tous les rdv passés et expirés avec des filtres sur les dates et
// sur les médecins du service avec une barre de recherche") : par défaut,
// les 90 derniers jours pour ce service — voir chargerHistoriqueRdv pour la
// fusion rendez_vous (guichet) + demandes_rendez_vous (en ligne, confirmées).
export default function HistoriquePage() {
  const { userProfile, etablissementId } = useAuth();
  const monServiceId = userProfile?.serviceId;

  const [dateDebut, setDateDebut] = useState(ilYA(90));
  const [dateFin, setDateFin] = useState(aujourdhui());
  const [medecins, setMedecins] = useState([]);
  const [medecinId, setMedecinId] = useState('');
  const [statut, setStatut] = useState('');
  const [recherche, setRecherche] = useState('');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!monServiceId) { setMedecins([]); return; }
    listerMedecinsDuService(etablissementId, monServiceId).then(setMedecins).catch(() => setMedecins([]));
  }, [etablissementId, monServiceId]);

  const charger = () => {
    if (!etablissementId || !dateDebut || !dateFin) return;
    setRows(null);
    chargerHistoriqueRdv(etablissementId, dateDebut, dateFin).then(setRows).catch((e) => {
      // #corrigé (retour utilisateur, "rien ne s'affiche alors que j'ai déjà
      // pris des RDV") : avalait silencieusement toute erreur (ex. index
      // Firestore encore en construction juste après le déploiement) —
      // indiscernable d'un historique réellement vide. Affichée maintenant.
      console.error('chargerHistoriqueRdv', e);
      toast.error(e.message?.includes('index') ? "Index Firestore encore en construction, réessayez dans une minute." : (e.message || 'Erreur de chargement'), { duration: 8000 });
      setRows([]);
    });
  };
  useEffect(charger, [etablissementId, dateDebut, dateFin]);

  const filtres = useMemo(() => {
    if (!rows) return [];
    const q = recherche.trim().toLowerCase();
    return rows
      .filter((r) => !monServiceId || !r.serviceId || r.serviceId === monServiceId)
      .filter((r) => !medecinId || r.medecinId === medecinId)
      .filter((r) => !statut || r.statut === statut)
      .filter((r) => !q || (r.patientNom || '').toLowerCase().includes(q));
  }, [rows, monServiceId, medecinId, statut, recherche]);

  const columns = [
    { key: 'dateHeure', label: 'Date / heure', render: (r) => r.dateHeure?.toDate ? r.dateHeure.toDate().toLocaleString('fr-FR') : '—' },
    { key: 'patientNom', label: 'Patient' },
    { key: 'medecinNom', label: 'Médecin', render: (r) => r.medecinNom ? `Dr ${r.medecinNom}` : '—' },
    { key: 'origine', label: 'Origine', render: (r) => r.origine === 'en_ligne' ? 'En ligne' : 'Guichet' },
    { key: 'motif', label: 'Motif', render: (r) => r.motif || '—' },
    { key: 'statut', label: 'Statut', render: (r) => <StatusBadge label={LABEL_STATUT[r.statut] || r.statut} tone={TONE_STATUT[r.statut] || 'gray'} /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <History size={22} className="text-primary" /> Historique
        </h1>
        <p className="text-muted-foreground mt-1">Rendez-vous passés et expirés — guichet et en ligne, tous statuts confondus.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Pour une demande encore en attente ou refusée (aucun rendez-vous confirmé), la colonne Date/heure indique la date de la DEMANDE, pas d'un rendez-vous.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
        <div className="space-y-1.5">
          <Label>Du</Label>
          <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Au</Label>
          <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
        {medecins.length > 0 && (
          <div className="space-y-1.5 sm:w-56">
            <Label>Médecin</Label>
            <Select value={medecinId || 'tous'} onValueChange={(v) => setMedecinId(v === 'tous' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les médecins</SelectItem>
                {medecins.map((m) => <SelectItem key={m.uid} value={m.uid}>{m.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:w-48">
          <Label>Statut</Label>
          <Select value={statut || 'tous'} onValueChange={(v) => setStatut(v === 'tous' ? '' : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous statuts</SelectItem>
              {Object.entries(LABEL_STATUT).map(([valeur, label]) => <SelectItem key={valeur} value={valeur}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Label className="mb-1.5 block">Rechercher un patient</Label>
          <Search size={16} className="absolute left-3 top-[calc(50%+9px)] -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nom du patient…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
      </div>

      {rows === null ? (
        <Loader label="Chargement de l'historique…" />
      ) : (
        <DataTable columns={columns} rows={filtres} loading={false} emptyTitle="Aucun rendez-vous sur cette période" />
      )}
    </div>
  );
}

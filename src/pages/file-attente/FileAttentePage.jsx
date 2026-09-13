import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Ticket, Clock, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { listenRendezVous } from '../../services/rendezVousService';
import { listenDemandesConfirmees } from '../../services/demandesRendezVousService';
import { buildPatientsQuery } from '../../services/patientsService';
import {
  trouverBilletValidePourDate, creerBillet, saisirParametres, listenBilletsParService,
} from '../../services/billetsSessionService';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import StatusBadge from '../../components/common/StatusBadge';

const PARAMETRES_VIDE = { temperature: '', tension: '', poids: '', pouls: '' };

const debutJour = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const finJour = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

const PERIODES = {
  aujourdhui: () => { const j = new Date(); return [debutJour(j), finJour(j)]; },
  demain: () => { const j = new Date(); j.setDate(j.getDate() + 1); return [debutJour(j), finJour(j)]; },
  semaine: () => {
    const j = new Date();
    const decalageLundi = j.getDay() === 0 ? -6 : 1 - j.getDay();
    const lundi = new Date(j); lundi.setDate(j.getDate() + decalageLundi);
    const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
    return [debutJour(lundi), finJour(dimanche)];
  },
  mois: () => {
    const j = new Date();
    return [debutJour(new Date(j.getFullYear(), j.getMonth(), 1)), finJour(new Date(j.getFullYear(), j.getMonth() + 1, 0))];
  },
};
const LABEL_PERIODE = { aujourdhui: "Aujourd'hui", demain: 'Demain', semaine: 'Cette semaine', mois: 'Ce mois', personnalise: 'Personnalisé' };
const versInput = (d) => d.toISOString().slice(0, 10);

// Guichet (rendez_vous, statut) — 'annule'/'termine'/'absent' ne sont plus
// des rendez-vous À VENIR, ils sortent de la file.
const LABEL_STATUT_GUICHET = { planifie: 'Planifié', confirme: 'Confirmé' };
const TONE_STATUT_GUICHET = { planifie: 'amber', confirme: 'green' };
const LABEL_ORIGINE = { guichet: 'Guichet', en_ligne: 'RDV en ligne', teleconsultation: 'Téléconsultation' };
const TONE_ORIGINE = { guichet: 'gray', en_ligne: 'blue', teleconsultation: 'blue' };

// État du billet lié (§ billet de session) — 'aucun' = pas encore de billet
// pour ce rendez-vous (patient pas encore présenté à l'accueil).
const LABEL_ETAT = { a_payer: 'À payer', arrive: 'En attente des paramètres', pret: 'Prêt (paramètres saisis)', consulte: 'Consulté', aucun: 'Aucun billet' };
const TONE_ETAT = { a_payer: 'amber', arrive: 'blue', pret: 'green', consulte: 'gray', aucun: 'gray' };
const LABEL_FILTRE_ETAT = { tous: 'Tous les états', ...LABEL_ETAT };

// #reconstruit (demande utilisateur, "la File d'attente doit contenir les
// patients ayant un rendez-vous confirmé par l'accueil, avec toutes les
// informations, en gardant les filtres de date actuels") : abandonne
// entièrement l'ancienne approche basée sur billets_session/statut 'pret'
// (source de confusion répétée — un billet payé/vu n'est pas un rendez-vous,
// et inversement) au profit d'une vraie liste de RENDEZ-VOUS : ceux pris au
// guichet ("Rendez-vous > Nouveau rendez-vous", collection rendez_vous,
// statut planifié ou confirmé) ET les demandes en ligne que l'accueil a
// explicitement confirmées ("Demandes en ligne > Confirmer",
// demandes_rendez_vous statut 'confirme'). Les mêmes filtres de période
// (aujourd'hui/demain/cette semaine/ce mois/personnalisé) restent
// fonctionnels, appliqués côté client sur l'heure du rendez-vous — même
// principe qu'avant, aucun nouvel index Firestore requis.
export default function FileAttentePage() {
  const { user, userProfile, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const [rendezVous, setRendezVous] = useState(null);
  const [demandesConfirmees, setDemandesConfirmees] = useState(null);
  const [billetsService, setBilletsService] = useState(null);
  const [patients, setPatients] = useState(null);
  const [periode, setPeriode] = useState('aujourdhui');
  // #nouveau (demande utilisateur, "filtre par défaut sur l'état prêt pour
  // aujourd'hui, donc les patients dont les paramètres ont déjà été
  // saisis") : 'pret' par défaut — se combine avec la période par défaut
  // ("Aujourd'hui") pour montrer directement les patients déjà pris en
  // charge par l'accueil aujourd'hui.
  const [etatFiltre, setEtatFiltre] = useState('pret');
  const [rdvOuvert, setRdvOuvert] = useState(null);
  const [billetResolu, setBilletResolu] = useState(null);
  const [resolutionEnCours, setResolutionEnCours] = useState(false);
  const [parametres, setParametres] = useState(PARAMETRES_VIDE);
  const [saving, setSaving] = useState(false);
  const [personnaliseDebut, setPersonnaliseDebut] = useState(versInput(new Date()));
  const [personnaliseFin, setPersonnaliseFin] = useState(versInput(new Date()));

  const [dateDebut, dateFin] = useMemo(() => {
    if (periode === 'personnalise') return [debutJour(new Date(personnaliseDebut)), finJour(new Date(personnaliseFin))];
    return PERIODES[periode]();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, personnaliseDebut, personnaliseFin]);

  useEffect(() => listenRendezVous(etablissementId, setRendezVous), [etablissementId]);
  useEffect(() => listenDemandesConfirmees(etablissementId, setDemandesConfirmees), [etablissementId]);

  const monServiceId = userProfile?.serviceId;

  useEffect(() => {
    if (!monServiceId) return;
    return listenBilletsParService(etablissementId, monServiceId, setBilletsService);
  }, [etablissementId, monServiceId]);

  // #corrigé (retour utilisateur, "aucun billet lié à ce rendez-vous en
  // ligne — problème à signaler") : une demande en ligne ne porte que le
  // compte du patient (patientUid), pas l'id de sa fiche `patients/{id}`
  // (utilisé par billets_session.patientId) — sans cette table de
  // correspondance, une ligne "RDV en ligne" ne pouvait JAMAIS retrouver son
  // billet autrement que par demandeId, or ce champ n'est réécrit que sur le
  // DERNIER rendez-vous confirmé du patient (confirmerDemande réutilise le
  // même billet) : toute confirmation plus ancienne pour le même patient
  // perdait ce lien. Résolu une fois pour toutes via la liste des patients
  // (déjà disponible, même requête que BilletsSessionPage/RendezVousPage).
  useEffect(() => {
    if (!etablissementId) return;
    getDocs(buildPatientsQuery(etablissementId)).then((snap) => setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [etablissementId]);

  const patientIdParUid = useMemo(
    () => new Map((patients || []).filter((p) => p.patientUid).map((p) => [p.patientUid, p.id])),
    [patients],
  );

  // #nouveau (demande utilisateur, "filtre par défaut sur l'état prêt") :
  // deux façons de retrouver le billet d'un rendez-vous confirmé — par
  // demandeId (posé par confirmerDemande, mais seulement le PLUS RÉCENT pour
  // un patient donné) ou par le billet le plus récent du même patient (fiche)
  // — cette seconde voie reste fiable même quand demandeId a été écrasé par
  // une confirmation plus récente pour le même patient.
  const { billetsParDemandeId, billetParPatientLePlusRecent } = useMemo(() => {
    const parDemande = new Map();
    const parPatient = new Map();
    (billetsService || []).forEach((b) => {
      if (b.demandeId) parDemande.set(b.demandeId, b);
      if (b.patientId) {
        const existant = parPatient.get(b.patientId);
        if (!existant || (b.createdAt?.toMillis?.() || 0) > (existant.createdAt?.toMillis?.() || 0)) parPatient.set(b.patientId, b);
      }
    });
    return { billetsParDemandeId: parDemande, billetParPatientLePlusRecent: parPatient };
  }, [billetsService]);

  const rendezVousConfirmes = useMemo(() => {
    if (!monServiceId || rendezVous === null || demandesConfirmees === null || billetsService === null) return null;
    const duGuichet = rendezVous
      .filter((r) => r.serviceId === monServiceId && (r.statut === 'planifie' || r.statut === 'confirme'))
      .map((r) => ({
        id: `rdv_${r.id}`,
        rawId: r.id,
        patientId: r.patientId,
        patientNom: r.patientNom,
        heure: r.dateHeure?.toDate?.() || null,
        service: r.service,
        medecinId: null,
        medecinNom: null,
        motif: r.motif,
        statutLabel: LABEL_STATUT_GUICHET[r.statut],
        statutTone: TONE_STATUT_GUICHET[r.statut],
        origine: 'guichet',
        billetStatut: billetParPatientLePlusRecent.get(r.patientId)?.statut || 'aucun',
      }));
    const enLigne = demandesConfirmees
      .filter((d) => d.serviceId === monServiceId)
      .map((d) => {
        const patientId = d.patientFicheId || patientIdParUid.get(d.patientUid) || null;
        const billet = billetsParDemandeId.get(d.id) || (patientId ? billetParPatientLePlusRecent.get(patientId) : null);
        return {
          id: `demande_${d.id}`,
          rawId: d.id,
          patientId,
          patientNom: d.patientNom,
          heure: d.dateHeure?.toDate?.() || null,
          service: d.serviceNom,
          medecinId: d.medecinId || null,
          medecinNom: d.medecinNom,
          motif: d.motif,
          statutLabel: 'Confirmé',
          statutTone: 'green',
          origine: d.type === 'teleconsultation' ? 'teleconsultation' : 'en_ligne',
          billetStatut: billet?.statut || 'aucun',
        };
      });
    return [...duGuichet, ...enLigne]
      .filter((r) => r.heure && r.heure >= dateDebut && r.heure <= dateFin)
      .filter((r) => etatFiltre === 'tous' || r.billetStatut === etatFiltre)
      .sort((a, b) => a.heure - b.heure);
  }, [rendezVous, demandesConfirmees, billetsService, billetsParDemandeId, billetParPatientLePlusRecent, patientIdParUid, monServiceId, dateDebut, dateFin, etatFiltre]);

  // #nouveau (demande utilisateur, "quand les patients se présentent à
  // l'accueil pour honorer le rendez-vous, on doit prendre leurs paramètres
  // — un popup pour saisir les paramètres et envoyer dans la file d'attente
  // du médecin") : le billet_session est ce qui fait réellement entrer un
  // patient dans la file du MÉDECIN (statut 'pret', cf. saisirParametres).
  // #corrigé (retour utilisateur, "aucun billet lié à ce rendez-vous en
  // ligne") : row.patientId est désormais toujours résolu en amont (fiche
  // patients/{id}, cf. patientIdParUid ci-dessus) pour les DEUX origines —
  // plus besoin de brancher sur `row.origine` ici, une seule recherche par
  // demandeId (le plus précis) puis par patient (fiable même si demandeId a
  // été réécrit par une confirmation plus récente pour le même patient).
  const ouvrirParametres = async (row) => {
    setRdvOuvert(row);
    setParametres(PARAMETRES_VIDE);
    setBilletResolu(null);
    setResolutionEnCours(true);
    try {
      let billet = null;
      if (row.origine !== 'guichet') {
        const snap = await getDocs(query(
          collection(db, 'billets_session'),
          where('etablissementId', '==', etablissementId),
          where('demandeId', '==', row.rawId),
        ));
        billet = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
      if (!billet && row.patientId && row.heure) {
        billet = await trouverBilletValidePourDate(row.patientId, etablissementId, row.heure, monServiceId);
      }
      setBilletResolu(billet);
      if (billet?.parametres) setParametres(billet.parametres);
    } catch {
      setBilletResolu(null);
    } finally {
      setResolutionEnCours(false);
    }
  };

  const enregistrerParametres = async () => {
    setSaving(true);
    try {
      let billetId = billetResolu?.id;
      if (!billetId) {
        if (!rdvOuvert.patientId) throw new Error("Ce patient n'a pas de fiche dans cet établissement — impossible de créer un billet de consultation.");
        const { billetId: nouveauId } = await creerBillet({
          patientId: rdvOuvert.patientId, patientNom: rdvOuvert.patientNom,
          serviceId: monServiceId, serviceNom: rdvOuvert.service,
          medecinId: rdvOuvert.medecinId, medecinNom: rdvOuvert.medecinNom,
        }, etablissementId, actor);
        billetId = nouveauId;
      }
      await saisirParametres(billetId, parametres, etablissementId, actor);
      toast.success('Paramètres enregistrés — patient envoyé dans la file d\'attente du médecin');
      setRdvOuvert(null);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (!userProfile?.serviceId) {
    return (
      <EmptyState
        title="Aucun service assigné à votre compte"
        description="Un administrateur doit vous rattacher à un service hospitalier (fiche Personnel, hospito-admin) avant que la file d'attente ne puisse s'afficher."
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Ticket size={22} className="text-primary" /> File d'attente
        </h1>
        <p className="text-muted-foreground mt-1">
          Patients ayant un rendez-vous confirmé pour {userProfile.service || 'votre service'}, dans l'ordre de leurs rendez-vous.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(LABEL_PERIODE).map((p) => (
            <Button key={p} type="button" size="sm" variant={periode === p ? 'default' : 'outline'} onClick={() => setPeriode(p)}>
              {LABEL_PERIODE[p]}
            </Button>
          ))}
        </div>
        {periode === 'personnalise' && (
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label>Du</Label>
              <Input type="date" value={personnaliseDebut} onChange={(e) => setPersonnaliseDebut(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Au</Label>
              <Input type="date" value={personnaliseFin} onChange={(e) => setPersonnaliseFin(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.keys(LABEL_FILTRE_ETAT).map((e) => (
          <Button key={e} type="button" size="sm" variant={etatFiltre === e ? 'default' : 'outline'} onClick={() => setEtatFiltre(e)}>
            {LABEL_FILTRE_ETAT[e]}
          </Button>
        ))}
      </div>

      {rendezVousConfirmes === null ? (
        <Loader label="Chargement de la file d'attente…" />
      ) : !rendezVousConfirmes.length ? (
        <EmptyState title="Aucun rendez-vous" description="Les rendez-vous confirmés (au guichet ou depuis une demande en ligne) apparaîtront ici, triés par heure, pour la période choisie." />
      ) : (
        <div className="glass-card-elevated overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Heure</th>
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Médecin</th>
                <th className="px-3 py-2 font-medium">Motif</th>
                <th className="px-3 py-2 font-medium">Origine</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">État</th>
              </tr>
            </thead>
            <tbody>
              {rendezVousConfirmes.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => ouvrirParametres(r)}
                  className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/40"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.heure ? (
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <Clock size={12} /> {r.heure.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {r.heure.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{r.patientNom}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.service || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.medecinNom ? `Dr ${r.medecinNom}` : '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.motif || '—'}</td>
                  <td className="px-3 py-2"><StatusBadge label={LABEL_ORIGINE[r.origine]} tone={TONE_ORIGINE[r.origine]} /></td>
                  <td className="px-3 py-2"><StatusBadge label={r.statutLabel} tone={r.statutTone} /></td>
                  <td className="px-3 py-2"><StatusBadge label={LABEL_ETAT[r.billetStatut]} tone={TONE_ETAT[r.billetStatut]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rdvOuvert && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setRdvOuvert(null)}>
          <div className="bg-background rounded-xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-foreground flex items-center gap-2">
              <Activity size={18} className="text-primary" /> Paramètres — {rdvOuvert.patientNom}
            </h3>
            {resolutionEnCours ? (
              <Loader label="Recherche du billet de consultation…" />
            ) : (
              <>
                {!billetResolu && (
                  <p className="text-xs text-amber-600">
                    Aucun billet de consultation existant pour ce rendez-vous — un nouveau sera créé à l'enregistrement.
                  </p>
                )}
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
              </>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setRdvOuvert(null)} disabled={saving}>Annuler</Button>
              <Button onClick={enregistrerParametres} disabled={saving || resolutionEnCours}>
                {saving ? 'Enregistrement…' : 'Enregistrer et envoyer au médecin'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

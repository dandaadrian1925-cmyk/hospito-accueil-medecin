import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ShieldCheck, ShieldAlert, Clock, FileSignature, Star, Package, XCircle, Timer } from 'lucide-react';
import toast from 'react-hot-toast';
import { db, auth } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { getAvisByUser } from '../services/avisService';
import { getStatsPerso } from '../services/commandesService';
import StatCard from '../components/common/StatCard';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import StatusBadge from '../components/common/StatusBadge';

const VILLES = [
  'Yaoundé', 'Douala',
  'Bafoussam', 'Dschang', 'Mbouda', 'Bafang',
  'Bamenda', 'Kumbo', 'Wum',
  'Buea', 'Limbe', 'Kumba', 'Mamfe', 'Tiko',
  'Garoua', 'Guider',
  'Maroua', 'Kousséri', 'Mokolo',
  'Ngaoundéré', 'Meiganga',
  'Bertoua', 'Batouri',
  'Ebolowa', 'Kribi', 'Sangmélima',
  'Mbalmayo', 'Obala', 'Nkongsamba', 'Edéa',
];

const EMPTY_FORM = {
  displayName: '', telephone: '', ville: '', quartier: '',
  garantNom: '', garantTelephone: '', garantRelation: '',
  urgenceNom: '', urgenceTelephone: '',
};

export default function ProfilPage() {
  const { user, userProfile, setUserProfile } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [avisStats, setAvisStats] = useState({ moyenne: null, total: 0 });
  const [statsPerso, setStatsPerso] = useState(null);

  useEffect(() => {
    if (user?.uid) {
      getAvisByUser(user.uid).then(({ moyenne, total }) => setAvisStats({ moyenne, total })).catch(() => {});
      getStatsPerso(user.uid).then(setStatsPerso).catch(() => {});
    }
  }, [user?.uid]);

  useEffect(() => {
    if (userProfile) {
      setForm({
        displayName: userProfile.displayName || '', telephone: userProfile.telephone || '',
        ville: userProfile.ville || '', quartier: userProfile.quartier || '',
        garantNom: userProfile.garantNom || '', garantTelephone: userProfile.garantTelephone || '', garantRelation: userProfile.garantRelation || '',
        urgenceNom: userProfile.urgenceNom || '', urgenceTelephone: userProfile.urgenceTelephone || '',
      });
    }
  }, [userProfile]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.displayName.trim()) { toast.error('Le nom est obligatoire'); return; }
    setSaving(true);
    try {
      const data = {
        displayName: form.displayName.trim(), telephone: form.telephone.trim(),
        ville: form.ville, quartier: form.quartier.trim(),
        garantNom: form.garantNom.trim(), garantTelephone: form.garantTelephone.trim(), garantRelation: form.garantRelation.trim(),
        urgenceNom: form.urgenceNom.trim(), urgenceTelephone: form.urgenceTelephone.trim(),
      };
      await updateDoc(doc(db, 'users', user.uid), data);
      await updateProfile(auth.currentUser, { displayName: data.displayName });
      setUserProfile((p) => ({ ...p, ...data }));
      setEditing(false);
      toast.success('Profil mis à jour');
    } catch (e) {
      toast.error(e.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (userProfile) {
      setForm({
        displayName: userProfile.displayName || '', telephone: userProfile.telephone || '',
        ville: userProfile.ville || '', quartier: userProfile.quartier || '',
        garantNom: userProfile.garantNom || '', garantTelephone: userProfile.garantTelephone || '', garantRelation: userProfile.garantRelation || '',
        urgenceNom: userProfile.urgenceNom || '', urgenceTelephone: userProfile.urgenceTelephone || '',
      });
    }
    setEditing(false);
  };

  return (
    <div className="max-w-lg space-y-4 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Mon profil</h1>
        <p className="text-muted-foreground mt-1">Vos informations personnelles.</p>
      </div>

      {/* Statut du dossier */}
      <div className="glass-card-elevated p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {userProfile?.cniVerifie ? <ShieldCheck size={16} className="text-success" /> : <ShieldAlert size={16} className="text-warning" />}
            Vérification CNI
          </div>
          {userProfile?.cniVerifie ? (
            <StatusBadge label="Vérifiée" tone="green" />
          ) : userProfile?.cniDemande ? (
            <StatusBadge label="En attente" tone="amber" />
          ) : userProfile?.cniRejete ? (
            <StatusBadge label="Rejetée" tone="red" />
          ) : (
            <Button size="sm" onClick={() => navigate('/verification-cni')}>Vérifier ma CNI</Button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FileSignature size={16} className={userProfile?.contratSigne ? 'text-success' : 'text-warning'} />
            Contrat signé au bureau
          </div>
          {userProfile?.contratSigne ? <StatusBadge label="Signé" tone="green" /> : <StatusBadge label="À faire" tone="amber" />}
        </div>
        {(!userProfile?.cniVerifie || !userProfile?.contratSigne) && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Clock size={13} className="flex-shrink-0 mt-0.5" />
            Ces deux étapes sont nécessaires avant de pouvoir recevoir des livraisons.
          </p>
        )}
      </div>

      {/* Score / réputation */}
      <div className="glass-card-elevated p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Star size={16} className="text-amber-500" />
            Ma réputation
          </div>
          {avisStats.total > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="font-display text-lg font-bold text-foreground">{avisStats.moyenne.toFixed(1)}</span>
              <Star size={15} className="text-amber-500 fill-amber-500" />
              <span className="text-xs text-muted-foreground">({avisStats.total} avis)</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Aucun avis pour l'instant</span>
          )}
        </div>
      </div>

      {statsPerso && statsPerso.totalAssignees > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Livraisons faites" value={statsPerso.totalLivrees} icon={Package} />
          <StatCard label="Taux d'annulation" value={`${statsPerso.tauxAnnulation}%`} icon={XCircle} tone={statsPerso.tauxAnnulation > 10 ? 'danger' : 'default'} />
          <StatCard label="Durée moyenne" value={statsPerso.dureeMoyenneMinutes != null ? `${statsPerso.dureeMoyenneMinutes} min` : '—'} icon={Timer} />
        </div>
      )}

      <div className="glass-card-elevated p-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={user?.email || ''} disabled />
          <p className="text-xs text-muted-foreground">L'email ne peut pas être modifié.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="displayName">Nom</Label>
          <Input id="displayName" value={form.displayName} disabled={!editing} onChange={(e) => set('displayName', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="telephone">Téléphone</Label>
          <Input id="telephone" value={form.telephone} disabled={!editing} onChange={(e) => set('telephone', e.target.value)} placeholder="6XX XX XX XX" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ville">Ville</Label>
            {editing ? (
              <select id="ville" value={form.ville} onChange={(e) => set('ville', e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Choisir…</option>
                {VILLES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <Input value={form.ville} disabled />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quartier">Quartier</Label>
            <Input id="quartier" value={form.quartier} disabled={!editing} onChange={(e) => set('quartier', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="glass-card-elevated p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">Garant</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Obligatoire pour compléter votre dossier de livreur MAKET.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="garantNom">Nom du garant</Label>
          <Input id="garantNom" value={form.garantNom} disabled={!editing} onChange={(e) => set('garantNom', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="garantTelephone">Téléphone</Label>
            <Input id="garantTelephone" value={form.garantTelephone} disabled={!editing} onChange={(e) => set('garantTelephone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="garantRelation">Lien de parenté</Label>
            <Input id="garantRelation" value={form.garantRelation} disabled={!editing} onChange={(e) => set('garantRelation', e.target.value)} placeholder="Ex. frère, oncle…" />
          </div>
        </div>
      </div>

      <div className="glass-card-elevated p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-foreground">Contact d'urgence</h3>
        <div className="space-y-1.5">
          <Label htmlFor="urgenceNom">Nom</Label>
          <Input id="urgenceNom" value={form.urgenceNom} disabled={!editing} onChange={(e) => set('urgenceNom', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="urgenceTelephone">Téléphone</Label>
          <Input id="urgenceTelephone" value={form.urgenceTelephone} disabled={!editing} onChange={(e) => set('urgenceTelephone', e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2.5">
        {editing ? (
          <>
            <Button variant="outline" onClick={cancel} disabled={saving}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</Button>
          </>
        ) : (
          <Button onClick={() => setEditing(true)}>Modifier</Button>
        )}
      </div>
    </div>
  );
}

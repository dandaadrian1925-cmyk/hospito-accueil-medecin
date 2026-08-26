import { useState } from 'react';
import { UserCircle, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateMyProfile, envoyerResetMotDePasse } from '../../services/profilService';
import { useAuth } from '../../context/AuthContext';
import { roleLabel } from '../../lib/permissions';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

function Section({ title, icon: Icon, children }) {
  return (
    <div className="glass-card-elevated p-6">
      <h3 className="font-display text-base font-semibold text-foreground mb-3.5 flex items-center gap-2">
        {Icon && <Icon size={16} className="text-primary" />} {title}
      </h3>
      {children}
    </div>
  );
}

const fmtDate = (v) => v?.toDate ? v.toDate().toLocaleDateString('fr-FR') : '—';

export default function ProfilPage() {
  const { user, userProfile } = useAuth();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMyProfile(user.uid, { displayName });
      toast.success('Profil mis à jour');
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!userProfile?.email) return;
    setResetSending(true);
    try {
      await envoyerResetMotDePasse(userProfile.email);
      toast.success(`Email de réinitialisation envoyé à ${userProfile.email}`);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <UserCircle size={22} className="text-primary" /> Mon profil
        </h1>
        <p className="text-muted-foreground mt-1">Informations de ton compte accueil.</p>
      </div>

      <Section title="Informations">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <Label>Nom affiché</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={userProfile?.email || ''} disabled />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-sm mt-4 pt-4 border-t border-border">
          <div><span className="text-muted-foreground">Rôle : </span>{roleLabel(userProfile?.role)}</div>
          <div><span className="text-muted-foreground">Créé le : </span>{fmtDate(userProfile?.createdAt)}</div>
        </div>

        <Button className="mt-4" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </Section>

      <Section title="Sécurité" icon={KeyRound}>
        <p className="text-sm text-muted-foreground mb-3.5">
          Envoie un email à ton adresse pour choisir un nouveau mot de passe.
        </p>
        <Button variant="outline" onClick={handleResetPassword} disabled={resetSending}>
          {resetSending ? 'Envoi…' : 'Réinitialiser mon mot de passe'}
        </Button>
      </Section>
    </div>
  );
}

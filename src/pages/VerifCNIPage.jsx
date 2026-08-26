import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Upload, CheckCircle, Clock, X } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadFile } from '../supabase/config';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import toast from 'react-hot-toast';

// #bug (retour utilisateur, corrigé — même classe que PublierPage/VerifCNIPage
// côté maket-client) : URL.createObjectURL(file) était appelé directement dans
// le rendu, recréant une nouvelle URL blob à chaque re-rendu de ce composant
// (ex. simple frappe dans le champ numéro de CNI) sans jamais révoquer les
// anciennes — fuite mémoire silencieuse. useMemo ne recalcule qu'au changement
// réel de fichier, et l'effet de nettoyage révoque proprement l'ancienne URL.
function UploadSlot({ label, file, onChange, onClear, capture }) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors ${file ? 'border-success bg-success/5' : 'border-input hover:border-primary/50'}`}>
        {file ? (
          <div className="flex items-center gap-3 w-full">
            <img src={url} alt={label} className="w-16 h-10 object-cover rounded-md flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-success truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button type="button" onClick={(e) => { e.preventDefault(); onClear(); }} className="text-destructive flex-shrink-0">
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Cliquer pour uploader</p>
          </>
        )}
        <input type="file" accept="image/*" capture={capture} onChange={(e) => onChange(e.target.files[0])} className="hidden" />
      </label>
    </div>
  );
}

// 8 Mo : largement suffisant pour une photo de CNI, évite qu'un fichier énorme (ou
// mal étiqueté) parte vers le bucket privé sans aucun retour avant l'échec Supabase.
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export default function VerifCNIPage() {
  const { user, userProfile, setUserProfile } = useAuth();
  const navigate = useNavigate();
  const [cniNumero, setCniNumero] = useState(userProfile?.cniNumero || '');
  const [recto, setRecto] = useState(null);
  const [verso, setVerso] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validateAndSet = (setter) => (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Le fichier doit être une image'); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error('Image trop lourde (8 Mo maximum)'); return; }
    setter(file);
  };

  if (userProfile?.cniVerifie) {
    return (
      <div className="max-w-md mx-auto text-center py-16 animate-fade-in">
        <div className="glass-card-elevated p-10 border-success/30">
          <CheckCircle size={56} className="text-success mx-auto mb-4" />
          <h2 className="font-display text-2xl font-bold text-foreground mb-2">Identité vérifiée</h2>
          <p className="text-muted-foreground mb-6">Votre CNI a déjà été vérifiée.</p>
          <Button onClick={() => navigate('/profil')}>Retour à mon profil</Button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center py-16 animate-fade-in">
        <div className="glass-card-elevated p-10">
          <Clock size={56} className="text-primary mx-auto mb-4" />
          <h2 className="font-display text-2xl font-bold text-foreground mb-2">Documents envoyés !</h2>
          <p className="text-muted-foreground mb-6">Notre équipe vérifie votre identité sous 24h.</p>
          <Button variant="outline" onClick={() => navigate('/profil')}>Retour à mon profil</Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!cniNumero.trim()) { toast.error('Le numéro de CNI est obligatoire'); return; }
    if (!recto || !verso || !selfie) { toast.error('Uploadez les deux faces de votre CNI et la photo avec la CNI en main'); return; }
    setLoading(true);
    try {
      const rectoUpload = await uploadFile('cni', `${user.uid}/recto_${Date.now()}`, recto);
      const versoUpload = await uploadFile('cni', `${user.uid}/verso_${Date.now()}`, verso);
      const selfieUpload = await uploadFile('cni', `${user.uid}/selfie_${Date.now()}`, selfie);
      await setDoc(doc(db, 'users', user.uid), {
        cniNumero: cniNumero.trim(),
        cniDemande: true,
        cniRejete: false,
        cniRectoPath: rectoUpload.path,
        cniVersoPath: versoUpload.path,
        cniSelfiePath: selfieUpload.path,
        cniSoumisAt: new Date().toISOString(),
      }, { merge: true });
      setUserProfile((p) => ({ ...p, cniNumero: cniNumero.trim(), cniDemande: true, cniRejete: false }));
      setSubmitted(true);
      toast.success('Documents envoyés !');
    } catch (e) {
      const MESSAGES = {
        TYPE_FICHIER_NON_AUTORISE: 'Type de fichier non autorisé (JPG, PNG ou PDF uniquement).',
        FICHIER_TROP_VOLUMINEUX: 'Fichier trop volumineux (10 Mo maximum).',
      };
      toast.error(MESSAGES[e.message] || ('Erreur lors de l\'envoi : ' + e.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
          <Shield size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Vérification d'identité</h1>
          <p className="text-sm text-muted-foreground">Obligatoire pour recevoir des livraisons</p>
        </div>
      </div>

      {userProfile?.cniRejete && (
        <div className="glass-card-elevated p-4 border-destructive/30 text-sm">
          <p className="font-semibold text-destructive">Demande précédente rejetée</p>
          {userProfile?.cniMotifRejet && <p className="text-muted-foreground mt-1">{userProfile.cniMotifRejet}</p>}
        </div>
      )}

      <div className="glass-card-elevated p-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="cniNumero">Numéro de CNI</Label>
          <Input id="cniNumero" value={cniNumero} onChange={(e) => setCniNumero(e.target.value)} placeholder="Ex. 123456789" />
        </div>

        <UploadSlot label="CNI Recto" file={recto} onChange={validateAndSet(setRecto)} onClear={() => setRecto(null)} />
        <UploadSlot label="CNI Verso" file={verso} onChange={validateAndSet(setVerso)} onClear={() => setVerso(null)} />
        <UploadSlot label="Photo de vous tenant votre CNI" file={selfie} onChange={validateAndSet(setSelfie)} onClear={() => setSelfie(null)} capture="user" />

        <Button className="w-full" disabled={loading} onClick={handleSubmit}>
          {loading ? 'Envoi…' : 'Envoyer pour vérification'}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Wallet, ArrowUpRight, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { listenWallet, getTransactions, initierRetrait, RETRAIT_MINIMUM } from '../services/walletService';
import { getSettings } from '../services/settingsService';
import StatCard from '../components/common/StatCard';
import EmptyState from '../components/common/EmptyState';
import Loader from '../components/common/Loader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import OperatorLogo from '../components/common/OperatorLogo';
import { OPERATEURS, operateurCorrespond } from '../utils/operateurs';

// #livraison : le livreur ne dépose jamais — son solde vient uniquement des
// courses créditées automatiquement (cf. commandesService.getGains, même grand
// livre `transactions`). Cette page ne fait que le retrait, réutilisant le
// pattern déjà construit dans maket-client/src/pages/WalletPage.jsx
// (initierRetrait, même Edge Function dynamic-processor, versement réel décidé
// plus tard par un admin).
export default function WalletPage() {
  const { user } = useAuth();
  const [solde, setSolde] = useState(0);
  const [transactions, setTransactions] = useState(null);
  const [retraitMinimum, setRetraitMinimum] = useState(RETRAIT_MINIMUM);
  const [montant, setMontant] = useState('');
  const [phone, setPhone] = useState('');
  const [operateur, setOperateur] = useState('MTN_MOMO_CMR');
  const [submitting, setSubmitting] = useState(false);
  const [confirmRetrait, setConfirmRetrait] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    return listenWallet(user.uid, ({ solde: s }) => setSolde(s));
  }, [user?.uid]);

  const rechargerTransactions = () => {
    if (!user?.uid) return;
    getTransactions(user.uid).then(setTransactions).catch(() => setTransactions([]));
  };

  useEffect(rechargerTransactions, [user?.uid]);
  useEffect(() => { getSettings().then((s) => setRetraitMinimum(s.retraitMinimum)); }, []);

  const handleConfirmerRetrait = async () => {
    const m = parseInt(montant, 10);
    setSubmitting(true);
    try {
      await initierRetrait(user.uid, m, phone, operateur);
      toast.success('Demande de retrait envoyée');
      setConfirmRetrait(false);
      setMontant('');
      setPhone('');
      rechargerTransactions();
    } catch (e) {
      toast.error(e.message || 'Erreur lors du retrait');
    } finally {
      setSubmitting(false);
    }
  };

  const montantSaisi = parseInt(montant, 10) || 0;
  const montantValide = montantSaisi >= retraitMinimum && montantSaisi <= solde && phone.length >= 9;

  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Mon wallet</h1>
        <p className="text-muted-foreground mt-1">Vos gains de livraison, retirables vers Mobile Money.</p>
      </div>

      <StatCard label="Solde disponible" value={`${solde.toLocaleString('fr-FR')} XAF`} icon={Wallet} tone="success" />

      <div className="glass-card-elevated p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-foreground">Retirer vers Mobile Money</h3>

        <div className="space-y-1.5">
          <Label htmlFor="montant">Montant (XAF)</Label>
          <Input id="montant" type="number" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={`Min. ${retraitMinimum.toLocaleString('fr-FR')} XAF`} />
          {montantSaisi > 0 && montantSaisi > solde && <p className="text-xs text-destructive">Solde insuffisant</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Opérateur</Label>
          <div className="grid grid-cols-2 gap-3">
            {OPERATEURS.map((op) => (
              <button key={op.id} type="button" onClick={() => setOperateur(op.id)}
                className="p-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center gap-2.5"
                style={{ borderColor: operateur === op.id ? 'var(--primary)' : 'var(--border)', background: operateur === op.id ? 'var(--accent)' : 'transparent' }}>
                <OperatorLogo id={op.id} size={26} />
                <span className="text-xs">{op.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Numéro Mobile Money</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6XX XX XX XX" maxLength={9} />
          {!operateurCorrespond(phone, operateur) && (
            <p className="text-xs text-destructive">Ce numéro ne correspond pas à {OPERATEURS.find((o) => o.id === operateur)?.label}.</p>
          )}
        </div>

        <Button className="w-full" disabled={!montantValide || !operateurCorrespond(phone, operateur) || submitting} onClick={() => setConfirmRetrait(true)}>
          <ArrowUpRight size={16} /> Retirer {montant ? montantSaisi.toLocaleString('fr-FR') : '—'} XAF
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-base font-semibold text-foreground">Historique</h3>
        {transactions === null ? (
          <Loader label="Chargement…" />
        ) : transactions.length === 0 ? (
          <EmptyState title="Aucune transaction" description="Vos gains et retraits apparaîtront ici." icon={Wallet} />
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div key={t.id} className="glass-card-elevated p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{t.description || t.type}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                    {t.statut === 'en_cours' && <span className="flex items-center gap-1"><Clock size={11} /> En cours</span>}
                  </p>
                </div>
                <span className={`font-display font-bold flex-shrink-0 ${t.montant >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {t.montant >= 0 ? '+' : ''}{t.montant.toLocaleString('fr-FR')} XAF
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmRetrait && (
        <ConfirmDialog
          title="Confirmer ce retrait ?"
          description={`Vous allez retirer ${montantSaisi.toLocaleString('fr-FR')} XAF vers ${phone} (${OPERATEURS.find((o) => o.id === operateur)?.label || operateur}).`}
          confirmLabel="Confirmer le retrait"
          onConfirm={handleConfirmerRetrait}
          onCancel={() => setConfirmRetrait(false)}
        />
      )}
    </div>
  );
}

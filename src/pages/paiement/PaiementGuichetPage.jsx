import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { listenFacturesEnAttente, encaisserEnEspeces } from '../../services/facturesService';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';
import ConfirmDialog from '../../components/common/ConfirmDialog';

export default function PaiementGuichetPage() {
  const { user, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const [factures, setFactures] = useState(null);
  const [factureAEncaisser, setFactureAEncaisser] = useState(null);

  useEffect(() => listenFacturesEnAttente(etablissementId, setFactures), [etablissementId]);

  const confirmerEncaissement = async () => {
    try {
      await encaisserEnEspeces(factureAEncaisser.id, etablissementId, actor);
      toast.success('Facture encaissée');
      setFactureAEncaisser(null);
    } catch (e) {
      toast.error(e.message || 'Échec de l’encaissement');
    }
  };

  if (factures === null) return <Loader label="Chargement des factures…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard size={22} className="text-primary" /> Paiement au guichet
        </h1>
        <p className="text-muted-foreground mt-1">Encaissez en espèces les factures des patients qui se présentent sur place.</p>
      </div>

      {!factures.length ? (
        <EmptyState title="Aucune facture en attente" description="Les factures en attente de paiement apparaîtront ici." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {factures.map((f) => (
            <div key={f.id} className="glass-card-elevated p-4 space-y-2">
              <span className="font-semibold text-foreground">{f.patientNom}</span>
              <p className="text-sm text-muted-foreground">{f.libelle}</p>
              <p className="text-lg font-bold text-foreground">{Number(f.montant).toLocaleString('fr-FR')} XAF</p>
              {f.campayReference ? (
                <p className="text-xs text-amber-600 font-medium">Paiement Mobile Money en cours — encaissement en espèces bloqué le temps de sa confirmation.</p>
              ) : (
                <Button size="sm" onClick={() => setFactureAEncaisser(f)}>Encaisser en espèces</Button>
              )}
            </div>
          ))}
        </div>
      )}

      {factureAEncaisser && (
        <ConfirmDialog
          title="Confirmer l'encaissement ?"
          description={`Confirmez avoir reçu ${Number(factureAEncaisser.montant).toLocaleString('fr-FR')} XAF en espèces de ${factureAEncaisser.patientNom} pour "${factureAEncaisser.libelle}".`}
          confirmLabel="Confirmer l'encaissement"
          onConfirm={confirmerEncaissement}
          onCancel={() => setFactureAEncaisser(null)}
        />
      )}
    </div>
  );
}

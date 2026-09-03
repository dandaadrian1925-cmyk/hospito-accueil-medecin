import { useEffect, useRef, useState } from 'react';
import { CreditCard, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { listenFacturesEnAttente, encaisserEnEspeces, encaisserAvecPreuve } from '../../services/facturesService';
import { uploadFile } from '../../supabase/config';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { Button } from '../../components/ui/button';
import ConfirmDialog from '../../components/common/ConfirmDialog';

export default function PaiementGuichetPage() {
  const { user, etablissementId } = useAuth();
  const actor = { uid: user.uid, email: user.email };
  const [factures, setFactures] = useState(null);
  const [factureAEncaisser, setFactureAEncaisser] = useState(null);
  const [factureCiblePourPreuve, setFactureCiblePourPreuve] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => listenFacturesEnAttente(etablissementId, setFactures), [etablissementId]);

  const confirmerEncaissement = async () => {
    try {
      await encaisserEnEspeces(factureAEncaisser.id, etablissementId, actor, factureAEncaisser.billetSessionId);
      toast.success('Facture encaissée');
      setFactureAEncaisser(null);
    } catch (e) {
      toast.error(e.message || 'Échec de l’encaissement');
    }
  };

  const declencherUploadPreuve = (facture) => {
    setFactureCiblePourPreuve(facture);
    fileInputRef.current?.click();
  };

  const handleFichierPreuve = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const facture = factureCiblePourPreuve;
    if (!file || !facture) return;
    setUploadingId(facture.id);
    try {
      const { publicUrl } = await uploadFile('preuves_paiement', `${etablissementId}/${facture.id}/preuve_${Date.now()}`, file);
      await encaisserAvecPreuve(facture.id, publicUrl, etablissementId, actor, facture.billetSessionId);
      toast.success('Facture encaissée avec preuve de paiement');
    } catch (err) {
      toast.error(err.message || "Échec de l'enregistrement de la preuve");
    } finally {
      setUploadingId(null);
      setFactureCiblePourPreuve(null);
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
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setFactureAEncaisser(f)} disabled={uploadingId === f.id}>Encaisser en espèces</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => declencherUploadPreuve(f)}
                    disabled={uploadingId === f.id}
                  >
                    <Upload size={14} className="mr-1" />
                    {uploadingId === f.id ? 'Envoi…' : 'Mobile Money (hors app)'}
                  </Button>
                </div>
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

      {/* Preuve Mobile Money hors app : le patient a payé par lui-même en
          dehors du flux CamPay in-app (ex. transfert direct), l'accueil
          constate le paiement via une capture d'écran/reçu Mobile Money. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFichierPreuve}
      />
    </div>
  );
}

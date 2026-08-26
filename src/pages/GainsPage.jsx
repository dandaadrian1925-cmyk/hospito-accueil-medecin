import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Package, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getGains } from '../services/commandesService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import StatCard from '../components/common/StatCard';

const JOURS = 14;

function buildSerie(gains) {
  const parJour = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = JOURS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    parJour[d.toISOString().slice(0, 10)] = 0;
  }
  gains.forEach((g) => {
    const key = new Date(g.date).toISOString().slice(0, 10);
    if (key in parJour) parJour[key] += g.montant;
  });
  return Object.entries(parJour).map(([date, montant]) => ({ date, montant }));
}

// #livraison : plus de calcul ad-hoc sur les commandes livrées — cf.
// commandesService.getGains, qui lit désormais le grand livre `transactions`
// (type credit_livraison), alimenté automatiquement par finaliserCommandeSiExpiree
// côté maket-client. La commission MAKET est déjà déduite du montant net affiché.
export default function GainsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    getGains(user.uid).then(setData).catch(() => setData({ gains: [], total: 0 }));
  }, [user?.uid]);

  if (!data) return <Loader label="Chargement de vos gains…" />;

  const { gains, total } = data;
  const serie = buildSerie(gains);
  const maxMontant = Math.max(...serie.map((s) => s.montant), 1);
  const debut30j = new Date();
  debut30j.setDate(debut30j.getDate() - 30);
  const total30j = gains.filter((g) => new Date(g.date) >= debut30j).reduce((s, g) => s + g.montant, 0);

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Mes gains</h1>
        <p className="text-muted-foreground mt-1">Frais de livraison crédités sur votre solde, commission MAKET déjà déduite.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total (tout historique)" value={`${total.toLocaleString('fr-FR')} XAF`} icon={Wallet} tone="success" />
        <StatCard label="30 derniers jours" value={`${total30j.toLocaleString('fr-FR')} XAF`} icon={TrendingUp} />
      </div>

      <div className="glass-card-elevated p-6">
        <h3 className="font-display text-base font-semibold text-foreground mb-4">{JOURS} derniers jours</h3>
        <div className="flex items-end gap-1.5 h-36">
          {serie.map(({ date, montant }) => (
            <div key={date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div
                className={`w-full rounded-t-md ${montant > 0 ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: `${Math.max((montant / maxMontant) * 100, montant > 0 ? 6 : 2)}%` }}
                title={`${new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} : ${montant.toLocaleString('fr-FR')} XAF`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
          <span>{new Date(serie[0].date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          <span>{new Date(serie[serie.length - 1].date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-base font-semibold text-foreground">Historique des courses payées</h3>
        {gains.length === 0 ? (
          <EmptyState title="Aucun gain pour l'instant" description="Vos livraisons terminées apparaîtront ici." icon={Package} />
        ) : (
          <div className="space-y-2">
            {gains.map((g) => (
              <button
                key={g.id}
                onClick={() => g.commandeId && navigate(`/commandes/${g.commandeId}`)}
                className="glass-card-elevated p-4 w-full text-left flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{g.description || 'Course livrée'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(g.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
                <span className="font-display font-bold text-success flex-shrink-0">+{g.montant.toLocaleString('fr-FR')} XAF</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { buildAuditLogsQuery } from '../../services/auditService';
import { useFirestorePagination } from '../../hooks/useFirestorePagination';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import DateRangeFilter from '../../components/common/DateRangeFilter';

const ACTION_LABELS = {
  'auth.connexion': 'Connexion',
  'admission.creer': 'Admission créée',
  'admission.changer_statut': 'Statut d\'admission modifié',
  'rendezvous.creer': 'Rendez-vous créé',
  'rendezvous.changer_statut': 'Statut de rendez-vous modifié',
};

export default function AuditLogPage() {
  const { etablissementId } = useAuth();
  const [{ debut, fin }, setDateRange] = useState({ debut: null, fin: null });
  const paginated = useFirestorePagination(() => buildAuditLogsQuery(etablissementId, { debut, fin }), [etablissementId, debut, fin]);

  const columns = [
    { key: 'createdAt', label: 'Date', render: (l) => l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString('fr-FR') : '—' },
    { key: 'adminEmail', label: 'Agent', render: (l) => l.adminEmail || l.adminUid?.slice(0, 8) || '—' },
    { key: 'action', label: 'Action', render: (l) => ACTION_LABELS[l.action] || l.action },
    { key: 'targetType', label: 'Cible', render: (l) => `${l.targetType || '—'} ${l.targetId ? `#${String(l.targetId).slice(0, 8)}` : ''}` },
    {
      key: 'details', label: 'Détails',
      render: (l) => l.details ? <span className="text-xs text-muted-foreground">{JSON.stringify(l.details)}</span> : '—',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Journal d'audit</h1>
        <p className="text-muted-foreground mt-1">Historique des actions effectuées à l'accueil.</p>
      </div>

      <DateRangeFilter debut={debut} fin={fin} onChange={setDateRange} />

      <DataTable columns={columns} rows={paginated.rows} loading={paginated.loading} emptyTitle="Aucune action enregistrée" pagination={paginated} />
    </div>
  );
}

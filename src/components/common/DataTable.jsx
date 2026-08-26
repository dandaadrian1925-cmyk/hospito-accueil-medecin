import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import EmptyState from './EmptyState';
import Loader from './Loader';

// columns: [{ key, label, render?(row) }]
// pagination (optionnel) : { page, hasPrev, hasMore, onPrev, onNext } — piloté par le parent
// (voir hooks/useFirestorePagination). Omis = pas de contrôles de pagination affichés.
export default function DataTable({ columns, rows, loading, emptyTitle = 'Aucune donnée', onRowClick, pagination }) {
  if (loading) return <Loader />;
  if (pagination?.error) {
    return (
      <div className="glass-card-elevated p-5 border-destructive/30">
        <p className="text-sm font-semibold text-destructive mb-1">Impossible de charger les données</p>
        <code className="text-xs text-muted-foreground break-all">{pagination.error}</code>
      </div>
    );
  }
  if (!rows.length) return <EmptyState title={emptyTitle} />;

  return (
    <div>
      <div className="glass-card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-6 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-6 py-3.5 text-foreground">
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && (pagination.hasPrev || pagination.hasMore) && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <Button variant="ghost" size="icon" disabled={!pagination.hasPrev} onClick={pagination.prevPage}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm text-muted-foreground font-medium">Page {pagination.page + 1}</span>
          <Button variant="ghost" size="icon" disabled={!pagination.hasMore} onClick={pagination.nextPage}>
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}

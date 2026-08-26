import { X } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export default function DateRangeFilter({ debut, fin, onChange, label = 'créé' }) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{`${label} du`}</Label>
        <Input type="date" value={debut || ''} max={fin || undefined} onChange={(e) => onChange({ debut: e.target.value || null, fin })} className="w-[150px]" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">au</Label>
        <Input type="date" value={fin || ''} min={debut || undefined} onChange={(e) => onChange({ debut, fin: e.target.value || null })} className="w-[150px]" />
      </div>
      {(debut || fin) && (
        <button
          type="button"
          onClick={() => onChange({ debut: null, fin: null })}
          className="h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          title="Effacer le filtre de dates"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

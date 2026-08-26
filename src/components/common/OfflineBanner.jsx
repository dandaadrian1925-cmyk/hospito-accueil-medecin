import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-warning/15 text-warning text-xs font-semibold px-4 py-2 border-b border-warning/30">
      <WifiOff size={14} />
      Hors ligne — vos actions (statuts, position) seront envoyées automatiquement à la reconnexion.
    </div>
  );
}

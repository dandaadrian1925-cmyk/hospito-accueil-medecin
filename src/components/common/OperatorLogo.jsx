// Port de maket-client/src/components/common/OperatorLogo.jsx — badge SVG aux
// couleurs officielles MTN (#FFCC00) / Orange (#FF7900), pas un fichier de
// marque officiel (aucun asset de ce type disponible dans le projet).
import { OPERATEURS } from '../../utils/operateurs';

export default function OperatorLogo({ id, size = 28 }) {
  if (id === 'MTN_MOMO_CMR') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-label="MTN Mobile Money">
        <rect width="100" height="100" rx="20" fill="#FFCC00" />
        <text x="50" y="63" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="32" fill="#000000">MTN</text>
      </svg>
    );
  }
  if (id === 'ORANGE_CMR') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Orange Money">
        <rect width="100" height="100" rx="20" fill="#FF7900" />
        <text x="50" y="64" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="24" fill="#FFFFFF">orange</text>
      </svg>
    );
  }
  const op = OPERATEURS.find((o) => o.id === id);
  return <div style={{ width: size, height: size, borderRadius: size * 0.2, background: op?.couleur || '#E2E8F0' }} />;
}

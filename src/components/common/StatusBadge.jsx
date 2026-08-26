import { Badge } from '../ui/badge';

const TONE_TO_VARIANT = {
  green: 'success',
  red: 'destructive',
  amber: 'warning',
  blue: 'info',
  gray: 'secondary',
};

export default function StatusBadge({ label, tone = 'gray' }) {
  return <Badge variant={TONE_TO_VARIANT[tone] || 'secondary'}>{label}</Badge>;
}

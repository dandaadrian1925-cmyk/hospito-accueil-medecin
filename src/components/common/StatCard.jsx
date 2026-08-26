import { motion } from 'framer-motion';

const TONES = {
  default: 'bg-secondary text-primary',
  danger: 'bg-secondary text-destructive',
  success: 'bg-secondary text-success',
  warn: 'bg-secondary text-warning',
};

export default function StatCard({ label, value, icon: Icon, tone = 'default', onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className={`stat-card ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold text-foreground mt-1">{value}</p>
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${TONES[tone] || TONES.default}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

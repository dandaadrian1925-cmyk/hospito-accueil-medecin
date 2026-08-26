export default function EmptyState({ title = 'Aucun résultat', description = '', icon: Icon = null }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-5 text-center text-muted-foreground">
      {Icon && <Icon size={32} strokeWidth={1.5} className="mb-3 text-muted-foreground/60" />}
      <div className={`font-semibold text-base text-foreground ${description ? 'mb-1' : ''}`}>{title}</div>
      {description && <div className="text-sm">{description}</div>}
    </div>
  );
}

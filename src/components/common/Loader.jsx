export default function Loader({ label = 'Chargement…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-5 text-muted-foreground">
      <div className="spin w-7 h-7 rounded-full border-[3px] border-border border-t-primary" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

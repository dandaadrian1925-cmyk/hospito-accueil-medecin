import { Construction } from 'lucide-react';

export default function ModulePrevu({ titre, phase }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 gap-3 text-muted-foreground">
      <Construction size={40} className="text-muted-foreground/60" />
      <h2 className="text-lg font-semibold text-foreground">{titre}</h2>
      <p className="text-sm max-w-md">
        Module prévu au cahier des charges — développement planifié en {phase}.
      </p>
    </div>
  );
}

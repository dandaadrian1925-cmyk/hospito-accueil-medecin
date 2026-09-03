import { UserPlus, CalendarClock, BedDouble, Siren, HeartHandshake, CreditCard, Clock, Ticket } from 'lucide-react';

// Socle commun à tout agent d'accueil (module: null — aucune permission
// requise, seul le rôle 'accueil' peut de toute façon se connecter à cette app).
export const HOSPITAL_MODULES = [
  { path: 'billets', label: 'Billet de session', icon: Ticket, module: null, phase: 'Phase 6' },
  { path: 'admissions', label: 'Admissions', icon: UserPlus, module: null, phase: 'Phase 1' },
  { path: 'rendez-vous', label: 'Rendez-vous', icon: CalendarClock, module: null, phase: 'Phase 1' },
  { path: 'lits', label: 'Disponibilité des lits', icon: BedDouble, module: null, phase: 'Phase 1' },
  { path: 'urgences', label: 'Urgences (accueil/tri)', icon: Siren, module: null, phase: 'Phase 2' },
  { path: 'visites', label: 'Visites', icon: HeartHandshake, module: null, phase: 'Phase 5' },
  { path: 'paiement', label: 'Paiement au guichet', icon: CreditCard, module: null, phase: 'Phase 4' },
  { path: 'transparence', label: 'Attente & transparence', icon: Clock, module: null, phase: 'Phase 5' },
];

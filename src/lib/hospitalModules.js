import { UserPlus, CalendarClock, HeartHandshake, CreditCard, Clock, Ticket } from 'lucide-react';

// Socle commun à tout agent d'accueil (module: null — aucune permission
// requise, seul le rôle 'accueil' peut de toute façon se connecter à cette app).
// #retiré (demande utilisateur) : "Disponibilité des lits" (suivi lit-par-lit
// abandonné, cf. hospito-admin) et "Urgences" (module retiré de cette app).
export const HOSPITAL_MODULES = [
  { path: 'billets', label: 'Billet de session', icon: Ticket, module: null, phase: 'Phase 6' },
  { path: 'admissions', label: 'Admissions', icon: UserPlus, module: null, phase: 'Phase 1' },
  { path: 'rendez-vous', label: 'Rendez-vous', icon: CalendarClock, module: null, phase: 'Phase 1' },
  { path: 'visites', label: 'Visites', icon: HeartHandshake, module: null, phase: 'Phase 5' },
  { path: 'paiement', label: 'Paiement au guichet', icon: CreditCard, module: null, phase: 'Phase 4' },
  { path: 'transparence', label: 'Attente & transparence', icon: Clock, module: null, phase: 'Phase 5' },
];

import { UserPlus, CalendarClock, HeartHandshake, CreditCard, Clock, Ticket } from 'lucide-react';

// Socle commun à tout agent d'accueil (module: null — aucune permission
// requise, seul le rôle 'accueil' peut de toute façon se connecter à cette app).
// #retiré (demande utilisateur) : "Disponibilité des lits" (suivi lit-par-lit
// abandonné, cf. hospito-admin) et "Urgences" (module retiré de cette app).
export const HOSPITAL_MODULES = [
  { path: 'billets', label: 'Billet de consultation', icon: Ticket, module: null, phase: 'Phase 6' },
  { path: 'admissions', label: 'Admissions', icon: UserPlus, module: null, phase: 'Phase 1' },
  { path: 'rendez-vous', label: 'Rendez-vous', icon: CalendarClock, module: null, phase: 'Phase 1' },
  { path: 'visites', label: 'Visites', icon: HeartHandshake, module: null, phase: 'Phase 5' },
  { path: 'paiement', label: 'Paiement au guichet', icon: CreditCard, module: null, phase: 'Phase 4' },
  { path: 'transparence', label: 'Attente & transparence', icon: Clock, module: null, phase: 'Phase 5' },
  // #nouveau (demande utilisateur, "l'accueil de chaque service entre les
  // horaires de travail générales de tous les médecins de son service et ça
  // s'affiche directement chez l'admin ainsi que pour tous les autres
  // services") : remplace l'ancien planning daté (route déjà existante,
  // jamais reliée à la sidebar) par la saisie/consultation des horaires
  // hebdomadaires récurrents.
  { path: 'planning', label: 'Horaires médecins', icon: Clock, module: null, phase: 'Phase 2' },
];

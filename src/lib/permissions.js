// Modèle de permissions du personnel — deny-by-default (voir hospito-admin
// pour le raisonnement complet, même modèle partagé sur tout le SGIH).

export const ROLES = [
  { value: 'medecin', label: 'Médecin' },
  { value: 'infirmier', label: 'Infirmier·ère' },
  { value: 'pharmacien', label: 'Pharmacien·ne' },
  { value: 'laborantin', label: 'Laborantin / technicien imagerie' },
  { value: 'accueil', label: 'Accueil' },
  { value: 'admin', label: 'Personnel administratif' },
  { value: 'direction', label: 'Direction' },
  { value: 'sysadmin', label: 'Administrateur système' },
];

// Rôle strictement autorisé à s'authentifier sur CETTE app (accueil) — cf.
// mémoire feedback_strict_role_auth.
export const ALLOWED_ROLES = ['accueil'];

export const STAFF_ROLES = ROLES.map((r) => r.value);

export function roleLabel(role) {
  return ROLES.find((r) => r.value === role)?.label || role;
}

export function hasPermission(userProfile, module, action = 'read') {
  if (!userProfile) return false;
  const actions = userProfile.permissions?.[module];
  return Array.isArray(actions) && actions.includes(action);
}

export function messageErreurPermission(e, module) {
  if (e?.code === 'permission-denied') {
    return `Vous n'avez pas accès au module "${module}" — demandez à un administrateur système de vérifier vos droits.`;
  }
  return e?.message || 'Erreur';
}

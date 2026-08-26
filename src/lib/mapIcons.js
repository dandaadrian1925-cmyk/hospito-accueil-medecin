import L from 'leaflet';

// Marqueurs "goutte" colorés avec emoji, en CSS pur — un style/couleur distinct par
// rôle pour les différencier d'un coup d'œil (soi-même/vendeur/acheteur/destination).
const creerIcone = (emoji, couleur) => L.divIcon({
  html: `<div style="background:${couleur};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white;"><span style="transform:rotate(45deg);font-size:14px;">${emoji}</span></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -28],
  className: '',
});

export const ICONE_MOI = creerIcone('🚚', '#2451C4');
export const ICONE_VENDEUR = creerIcone('🏪', '#D97706');
export const ICONE_ACHETEUR = creerIcone('🏠', '#059669');
export const ICONE_DESTINATION = creerIcone('📍', '#DC2626');

// Marqueur numéroté pour la vue "Ma tournée" (plusieurs arrêts sur une même
// carte) — la couleur distingue récupération (chez le vendeur) de livraison
// (chez l'acheteur), le numéro correspond à l'ordre dans la liste des livraisons.
export const creerIconeNumero = (numero, type) => {
  const couleur = type === 'pickup' ? '#D97706' : '#059669';
  return L.divIcon({
    html: `<div style="background:${couleur};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white;"><span style="transform:rotate(45deg);font-size:13px;font-weight:800;color:white;">${numero}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
    className: '',
  });
};

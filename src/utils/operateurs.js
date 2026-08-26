// Port de maket-client/src/utils/operateurs.js — voir ce fichier pour
// l'explication complète (préfixes officiels de numérotation mobile au
// Cameroun, information publique).
export const OPERATEURS = [
  { id: 'MTN_MOMO_CMR', label: 'MTN Mobile Money', couleur: '#FFCC00', prefixes: ['67', '650', '651', '652', '653', '654', '680', '681', '682', '683', '684'] },
  { id: 'ORANGE_CMR', label: 'Orange Money', couleur: '#FF7900', prefixes: ['69', '655', '656', '657', '658', '659', '685', '686', '687', '688', '689'] },
];

const normaliserChiffres = (phone) => (phone || '').replace(/\D/g, '').replace(/^237/, '').replace(/^0/, '');

export const operateurCorrespond = (phone, operateurId) => {
  const chiffres = normaliserChiffres(phone);
  if (!chiffres) return true;
  const op = OPERATEURS.find((o) => o.id === operateurId);
  if (!op) return true;
  return op.prefixes.some((p) => (chiffres.length <= p.length ? p.startsWith(chiffres) : chiffres.startsWith(p)));
};

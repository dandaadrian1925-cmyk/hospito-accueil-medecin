// #sécurité (audit, corrigé — même correctif que maket-client) : link vient
// d'un document notifications/FCM, jamais validé — un lien absolu
// (https://site-piege.com) ou un schéma javascript: aurait été affecté tel
// quel à window.location.href, un clic ouvrant une redirection hors MAKET.
export const lienInterneSur = link => {
  if (typeof link !== 'string') return '/notifications';
  if (link === '/') return link;
  if (/^\/[^/].*/.test(link)) return link;
  return '/notifications';
};

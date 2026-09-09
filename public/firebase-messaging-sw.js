// Service worker requis par Firebase Cloud Messaging pour recevoir les
// notifications push quand aucun onglet HostoConnect n'est ouvert au premier
// plan. Config codée en dur : ce ne sont pas des secrets, et un service
// worker ne peut pas lire les variables d'environnement Vite au runtime.
//
// #bug CRITIQUE (corrigé, audit) : gardait la config du projet Firebase
// MAKET ("maket-922e2") depuis le fork — jamais mise à jour vers le projet
// Hospito ("scuizz"). Le SDK Messaging s'authentifiait contre le MAUVAIS
// projet : toute notification reçue app fermée/en arrière-plan échouait
// silencieusement depuis la création de cette app.
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDziJgH3rj3D2jGU_mItqviS89RP5plD6k',
  authDomain: 'scuizz.firebaseapp.com',
  projectId: 'scuizz',
  storageBucket: 'scuizz.firebasestorage.app',
  messagingSenderId: '1019528653552',
  appId: '1:1019528653552:web:aef8ac773b6ac9a543f035',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const link = payload.fcmOptions?.link || payload.data?.link || '/';
  self.registration.showNotification(title || 'HostoConnect', {
    body: body || '',
    icon: '/icon-192.png',
    data: { link },
  });
});

// Présence d'un handler fetch (même en pur passthrough réseau, aucun cache
// d'assets ici — cf. résilience hors-ligne gérée au niveau de l'app) requise
// par Chrome pour reconnaître ce service worker comme installable en PWA.
self.addEventListener('fetch', () => {});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const target = new URL(link, self.location.origin).href;
      const existing = clientsArr.find((c) => c.url === target);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});

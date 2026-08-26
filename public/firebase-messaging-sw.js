// Service worker requis par Firebase Cloud Messaging pour recevoir les
// notifications push quand aucun onglet MAKET n'est ouvert au premier plan.
// Config codée en dur : ce ne sont pas des secrets, et un service worker ne peut
// pas lire les variables d'environnement Vite au runtime.
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB7PJY3hNWLnHXm-WgONJogwKLx3lpyras',
  authDomain: 'maket-922e2.firebaseapp.com',
  projectId: 'maket-922e2',
  storageBucket: 'maket-922e2.firebasestorage.app',
  messagingSenderId: '537042129990',
  appId: '1:537042129990:web:1a1477582221b94210a647',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const link = payload.fcmOptions?.link || payload.data?.link || '/';
  self.registration.showNotification(title || 'MAKET', {
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

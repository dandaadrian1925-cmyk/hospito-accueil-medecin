import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { db, getMessagingSafe } from '../firebase/config';
import { lienInterneSur } from '../lib/safeLink';
import toast from 'react-hot-toast';

// Web Push (VAPID) ne fonctionne pas de façon fiable dans la WebView Android
// nue utilisée par l'app Capacitor (contrairement à un vrai navigateur ou une
// PWA installée) — d'où cette branche dédiée qui passe par le plugin natif
// @capacitor/push-notifications (vrai token FCM de l'appareil) quand l'app
// tourne dans ce contexte. Même destination (users/{uid}.fcmTokens), même
// Edge Function d'envoi (send-push-notification) : elle envoie déjà via l'API
// FCM brute, donc aucun changement serveur nécessaire.
const initPushNative = async (userId) => {
  try {
    let statut = (await PushNotifications.checkPermissions()).receive;
    if (statut === 'prompt') statut = (await PushNotifications.requestPermissions()).receive;
    if (statut !== 'granted') return;

    await PushNotifications.addListener('registration', async (token) => {
      await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayUnion(token.value) });
    });
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const titre = notification.title || 'HostoConnect';
      const link = notification.data?.link;
      toast(titre, link ? { icon: '🔔', onClick: () => { window.location.href = lienInterneSur(link); } } : { icon: '🔔' });
    });
    await PushNotifications.register();
  } catch (e) {
    console.warn('Initialisation des notifications push (natif) échouée :', e.message);
  }
};

// Demande la permission de notification (si pas déjà décidée) puis enregistre le
// token FCM de cet appareil sur users/{uid}.fcmTokens — best-effort partout.
export const initPush = async (userId) => {
  if (!userId) return;
  if (Capacitor.isNativePlatform()) return initPushNative(userId);
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) return;
  try {
    if (Notification.permission === 'denied') return;
    const messaging = await getMessagingSafe();
    if (!messaging) return;

    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayUnion(token) });

    onMessage(messaging, (payload) => {
      const titre = payload.notification?.title || 'HostoConnect';
      const link = payload.fcmOptions?.link || payload.data?.link;
      toast(titre, link ? { icon: '🔔', onClick: () => { window.location.href = lienInterneSur(link); } } : { icon: '🔔' });
    });
  } catch (e) {
    console.warn('Initialisation des notifications push échouée :', e.message);
  }
};

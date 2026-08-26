import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { isSupported, getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Cache local persistant (IndexedDB) : un livreur en zone blanche garde ses
// livraisons déjà chargées à l'écran, et les écritures (statut, position) faites
// hors-ligne restent en file d'attente même si l'app est tuée par l'OS entre
// temps — sans ça, seule une file en mémoire existait, perdue si l'app
// redémarre avant le retour du réseau. persistentMultipleTabManager pour
// tolérer l'app ouverte dans plusieurs onglets sans erreur "failed-precondition".
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const googleProvider = new GoogleAuthProvider();

// getMessaging() jette une exception dans tout environnement sans support des
// notifications push web — isSupported() vérifie avant d'appeler.
export const getMessagingSafe = async () => {
  try {
    if (!(await isSupported())) return null;
    return getMessaging(app);
  } catch {
    return null;
  }
};

export default app;

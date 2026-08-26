import { useEffect, useState } from 'react';

// navigator.onLine ne détecte que la présence d'une interface réseau (pas une
// vraie connectivité Internet), mais reste le seul signal standard sans coût —
// suffisant pour prévenir honnêtement le livreur plutôt que de le laisser croire
// qu'une action a été envoyée alors qu'elle est en fait juste mise en file par
// Firestore (cf. persistentLocalCache, firebase/config.js).
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const setOn = () => setOnline(true);
    const setOff = () => setOnline(false);
    window.addEventListener('online', setOn);
    window.addEventListener('offline', setOff);
    return () => {
      window.removeEventListener('online', setOn);
      window.removeEventListener('offline', setOff);
    };
  }, []);

  return online;
}

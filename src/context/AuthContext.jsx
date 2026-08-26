import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase/config';
import { initPush } from '../services/pushNotificationsService';
import { ALLOWED_ROLES } from '../lib/permissions';

const HEARTBEAT_MS = 60000;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }

      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
        return;
      }

      unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
        if (docSnap.metadata.fromCache && !docSnap.exists()) return;

        const profile = docSnap.exists() ? docSnap.data() : null;

        if (profile?.banni) {
          toast.error('Ce compte a été suspendu.');
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          signOut(auth);
          return;
        }

        if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
          toast.error("Accès non autorisé à l'espace accueil");
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          signOut(auth);
          return;
        }

        setUser(firebaseUser);
        setUserProfile(profile);
        setLoading(false);
      }, (e) => {
        console.error('Écoute du profil accueil échouée :', e);
        setUser(firebaseUser);
        setUserProfile(null);
        setLoading(false);
      });
    });
    return () => { unsubscribeAuth(); if (unsubProfile) unsubProfile(); };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const beat = () => updateDoc(doc(db, 'users', user.uid), { lastActiveAt: serverTimestamp() }).catch(() => {});
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) initPush(user.uid);
  }, [user?.uid]);

  const isStaff = !!userProfile && ALLOWED_ROLES.includes(userProfile.role);

  return (
    <AuthContext.Provider value={{ user, userProfile, isStaff, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, doc, onSnapshot, query, where, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase/config';
import { initPush } from '../services/pushNotificationsService';
import { ALLOWED_ROLES } from '../lib/permissions';

const HEARTBEAT_MS = 60000;
const STORAGE_KEY = 'hospito-accueil-medecin:etablissementId';

const AuthContext = createContext(null);

// Un agent d'accueil pourrait en théorie exercer dans plusieurs établissements
// — même modèle d'affiliations que les autres apps du SGIH (cf. mémoire).
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [baseProfile, setBaseProfile] = useState(null);
  const [affiliations, setAffiliations] = useState(null);
  const [etablissementId, setEtablissementIdState] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setBaseProfile(null);
        setAffiliations(null);
        setLoading(false);
      }
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setBaseProfile(snap.exists() ? snap.data() : null);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, 'affiliations'), where('userId', '==', user.uid), where('role', 'in', ALLOWED_ROLES));
    const unsub = onSnapshot(q, (snap) => {
      const actives = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.actif);

      if (actives.length === 0) {
        toast.error("Accès non autorisé à l'espace accueil");
        setAffiliations([]);
        setLoading(false);
        signOut(auth);
        return;
      }

      setAffiliations(actives);
      setLoading(false);
      setEtablissementIdState((prev) => {
        if (prev && actives.some((a) => a.etablissementId === prev)) return prev;
        return actives[0].etablissementId;
      });
    }, (e) => {
      console.error('Écoute des affiliations échouée :', e);
      setAffiliations([]);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const setEtablissementId = (id) => {
    localStorage.setItem(STORAGE_KEY, id);
    setEtablissementIdState(id);
  };

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

  const activeAffiliation = affiliations?.find((a) => a.etablissementId === etablissementId) || null;
  const userProfile = (baseProfile && activeAffiliation)
    ? { ...baseProfile, ...activeAffiliation, uid: user.uid }
    : null;
  const isStaff = !!userProfile;

  return (
    <AuthContext.Provider value={{
      user, userProfile, isStaff, loading,
      etablissementId, affiliations: affiliations || [], setEtablissementId,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

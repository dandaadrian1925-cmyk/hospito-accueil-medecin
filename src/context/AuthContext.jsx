import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase/config';
import { initPush } from '../services/pushNotificationsService';

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

      // Un premier onAuthStateChanged(null) a déjà mis loading à false au chargement
      // initial (avant que Firebase Auth ne confirme une session existante). Sans
      // repasser loading à true ici, ProtectedRoute voyait un bref instant où `user`
      // est rempli mais `userProfile` pas encore arrivé (donc isLivreur encore faux)
      // et renvoyait vers /login juste après une connexion pourtant valide, avant même
      // que le profil Firestore ait eu le temps d'arriver — un vrai bug de course,
      // repéré en testant une vraie connexion dans un navigateur (pas visible par un
      // simple `npm run build`).
      setLoading(true);

      // Écoute en direct (pas une lecture unique à la connexion) : un admin peut
      // bannir ce livreur ou lui retirer son rôle pendant qu'il a l'app ouverte en
      // pleine livraison — sans ça, l'accès (y compris marquer une commande livrée)
      // restait valide jusqu'au prochain rafraîchissement du token (~1h).
      unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
        // Avec le cache local persistant (persistentLocalCache, cf. firebase/config.js),
        // un appareil qui n'a encore jamais mis ce document en cache peut recevoir un
        // premier snapshot local vide (fromCache: true, exists: false) avant la vraie
        // réponse du serveur — ignoré pour ne pas le traiter comme un profil manquant.
        if (docSnap.metadata.fromCache && !docSnap.exists()) return;

        const profile = docSnap.exists() ? docSnap.data() : null;

        if (profile?.banni) {
          toast.error('Votre compte a été suspendu. Contactez MAKET si vous pensez qu\'il s\'agit d\'une erreur.');
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          signOut(auth);
          return;
        }

        // #sécurité (corrigé, audit — incohérence UX) : seul `banni`
        // forçait la déconnexion ici, contrairement à maket-client
        // (AuthContext.jsx) qui traite déjà soldeSuspect/compteSupprime au
        // même niveau — ces comptes étaient déjà bloqués en écriture côté
        // règles, mais restaient connectés côté livreur avec des erreurs
        // permission-denied non expliquées au lieu d'un message clair.
        if (profile?.soldeSuspect) {
          toast.error('Ce compte est actuellement soumis à une vérification suite à une anomalie détectée sur votre solde. Contactez le support MAKET pour la lever.', { duration: 8000 });
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          signOut(auth);
          return;
        }
        if (profile?.compteSupprime) {
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          signOut(auth);
          return;
        }

        if (!profile || profile.role !== 'livreur') {
          toast.error("Accès non autorisé à l'espace livreur");
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
        console.error('Écoute du profil livreur échouée :', e);
        setUser(firebaseUser);
        setUserProfile(null);
        setLoading(false);
      });
    });
    return () => { unsubscribeAuth(); if (unsubProfile) unsubProfile(); };
  }, []);

  // "Dernière connexion"/statut en ligne côté admin (cf. UtilisateurDetailPage) —
  // approximé par un battement régulier tant que l'app reste ouverte (pas de
  // présence temps réel possible avec Firestore seul, contrairement à Realtime
  // Database). Écriture déjà couverte par les règles existantes.
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

  const isLivreur = !!userProfile && userProfile.role === 'livreur';

  return (
    <AuthContext.Provider value={{ user, userProfile, isLivreur, loading, setUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

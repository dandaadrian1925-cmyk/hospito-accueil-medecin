import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/config';

export const loginWithEmail = async (email, password) => {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
};

export const logout = () => signOut(auth);

// #nouveau (retour utilisateur, corrigé) : aucun chemin de récupération
// n'existait sur l'écran de connexion — un livreur qui oubliait son mot de
// passe restait bloqué dehors sans recours. Même fonction Firebase Auth
// standard, peu importe que le compte ait été provisionné par MAKET plutôt
// qu'auto-inscrit.
export const resetPassword = email => sendPasswordResetEmail(auth, email);

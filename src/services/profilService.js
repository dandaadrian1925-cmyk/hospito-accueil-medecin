import { doc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../firebase/config';

export const updateMyProfile = async (uid, { displayName }) => {
  await updateDoc(doc(db, 'users', uid), { displayName });
};

export const envoyerResetMotDePasse = (email) => sendPasswordResetEmail(auth, email);

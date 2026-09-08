import { createClient } from '@supabase/supabase-js';
import { auth } from '../firebase/config';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// #sécurité (variant analysis, corrigé) : miroir client de la liste blanche
// server-side (cf. Edge Function secure-upload-url) — le serveur reste la
// VRAIE barrière (contournable par un appel direct à l'API), mais valider
// avant même de demander une URL signée évite un aller-retour réseau pour un
// fichier de toute façon rejeté, et donne un message clair immédiatement.
// Absent jusqu'ici de cette app (contrairement à maket-client), alors que
// VerifCNIPage/CommandeDetailPage (preuves agence) uploadent bien des fichiers.
const EXTENSIONS_AUTORISEES = {
  cni: ['jpg', 'jpeg', 'png', 'pdf'],
  litiges: ['jpg', 'jpeg', 'png', 'webp'],
  // #nouveau (demande utilisateur, "preuve de paiement Mobile Money hors app")
  preuves_paiement: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
};
const TAILLE_MAX_IMAGE = 10 * 1024 * 1024;

// Upload file to Supabase Storage.
// Ajoute automatiquement l'extension réelle du fichier (nécessaire pour les
// policies RLS basées sur storage.extension(), et pour que les navigateurs/
// lecteurs vidéo identifient correctement le type de fichier).
// La clé anon Supabase ne suffit plus à uploader directement (elle ne peut pas
// prouver une identité Firebase) : on demande d'abord une URL signée à usage
// unique à l'Edge Function secure-upload-url, qui vérifie le token Firebase
// de l'utilisateur et que le chemin demandé lui appartient bien (cf. ce
// fichier pour le détail des règles par bucket).
// Renvoie { path, publicUrl } :
//  - path : à utiliser pour les buckets privés (cni, factures, litiges privés)
//  - publicUrl : à utiliser uniquement pour les buckets publics (annonces, litiges)
export const uploadFile = async (bucket, path, file) => {
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const extensionsBucket = EXTENSIONS_AUTORISEES[bucket];
  if (!extensionsBucket || !extensionsBucket.includes(ext)) throw new Error('TYPE_FICHIER_NON_AUTORISE');
  if (file.size > TAILLE_MAX_IMAGE) throw new Error('FICHIER_TROP_VOLUMINEUX');
  const fullPath = `${path}.${ext}`;

  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${supabaseUrl}/functions/v1/hospito-secure-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
      'X-Firebase-Token': idToken,
    },
    body: JSON.stringify({ bucket, path: fullPath }),
  });
  const authData = await res.json();
  if (!res.ok) throw new Error(authData.error || "Upload non autorisé");

  // #sécurité (variant analysis, corrigé) : Content-Type dérivé côté serveur
  // (cf. secure-upload-url), jamais `file.type` seul (déclaré par le
  // navigateur, pas une preuve).
  // #bug CRITIQUE (corrigé, "upload des résultats d'examens" — trouvé en
  // testant un AUTRE bucket, révèle que "preuves_paiement" était cassé en
  // production) : le bucket HostoConnect réel (ex. "hospito-preuves_paiement")
  // diffère du nom logique demandé ("preuves_paiement") — uploader avec le
  // nom logique pointe vers un bucket différent de celui signé par le
  // serveur, rejeté avec un 400 à chaque tentative. Toujours utiliser le
  // bucket/chemin renvoyés par le serveur (même correctif déjà appliqué dans
  // hospito-admin/hospito-patient/hospito-super-admin).
  const storageBucket = authData.bucket || bucket;
  const storagePath = authData.path || fullPath;
  const { error } = await supabase.storage.from(storageBucket).uploadToSignedUrl(storagePath, authData.token, file, {
    contentType: authData.contentType || file.type || undefined,
  });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
  return { path: storagePath, publicUrl };
};

// Delete file from Supabase Storage
export const deleteFile = async (bucket, path) => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
};

// Génère des URLs signées temporaires pour des fichiers du bucket privé "cni"
// (pièces d'identité). Le bucket n'a aucune policy SELECT — la clé anon ne
// peut pas lire ces fichiers — donc ça passe par une Edge Function qui utilise
// la clé service_role côté serveur, après avoir vérifié que l'appelant est un
// admin MAKET (cf. supabase/functions/get-cni-signed-urls). Renvoie une map
// { [path]: signedUrl }.
export const getCniSignedUrls = async (paths) => {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${supabaseUrl}/functions/v1/hospito-get-cni-signed-urls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
      'X-Firebase-Token': idToken,
    },
    body: JSON.stringify({ bucket: 'cni', paths }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur de génération des URLs signées');
  return data.signedUrls;
};

// Génère des URLs signées pour les preuves de dépôt/récupération en agence
// (livraison inter-villes), stockées dans le bucket PRIVÉ "litiges" sous le
// préfixe "livraison/{commandeId}/" (même bucket que les preuves de litige,
// réutilisé par convention). #sécurité (variant analysis, corrigé) : cassées
// depuis que ce bucket a été rendu privé — resoudreUrlsLivraison remplace les
// anciennes URLs "publiques" stockées (commande.preuveAgenceDepotUrl/
// preuveAgenceRecuperationUrl) par des URLs signées à courte durée de vie,
// via l'Edge Function get-litige-signed-urls (mode commandeId, réservé au(x)
// livreur(s) réellement assigné(s) à cette commande).
const pathFromLitigePublicUrl = (url) => {
  const marker = '/storage/v1/object/public/litiges/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
};

export const resoudreUrlsLivraison = async (commandeId, urls) => {
  const paths = (urls || []).filter(Boolean).map(pathFromLitigePublicUrl).filter(Boolean);
  if (paths.length === 0) return urls;
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(`${supabaseUrl}/functions/v1/hospito-get-litige-signed-urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
        'X-Firebase-Token': idToken,
      },
      body: JSON.stringify({ commandeId, paths }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur de génération des URLs signées');
    return (urls || []).map((url) => {
      const path = url && pathFromLitigePublicUrl(url);
      return (path && data.signedUrls[path]) || url;
    });
  } catch (e) {
    console.warn('Résolution des URLs de preuve agence échouée :', e.message);
    return urls;
  }
};

// Déclenche l'envoi d'une notification push (FCM) pour une notification déjà
// créée dans Firestore (cf. notificationsService.js) — best-effort.
export const pousserNotification = async (notificationId) => {
  try {
    if (!auth.currentUser) return;
    const idToken = await auth.currentUser.getIdToken();
    await fetch(`${supabaseUrl}/functions/v1/hospito-send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
        'X-Firebase-Token': idToken,
      },
      body: JSON.stringify({ notificationId }),
    });
  } catch (e) {
    console.warn('Envoi de la notification push échoué :', e.message);
  }
};

export default supabase;

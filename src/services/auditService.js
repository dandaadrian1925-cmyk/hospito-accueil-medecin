import { addDoc, collection, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { clausesPlageDate } from '../lib/dateFilters';

export const logAction = async ({ actor, action, etablissementId, targetType, targetId, details }) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      adminUid: actor?.uid || null,
      adminEmail: actor?.email || null,
      etablissementId: etablissementId ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      details: details || null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Échec de la journalisation d'audit :", err);
  }
};

export const buildAuditLogsQuery = (etablissementId, filters = {}) =>
  query(
    collection(db, 'audit_logs'),
    where('etablissementId', '==', etablissementId),
    ...clausesPlageDate('createdAt', filters.debut, filters.fin),
    orderBy('createdAt', 'desc'),
  );

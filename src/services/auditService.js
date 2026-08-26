import { addDoc, collection, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { clausesPlageDate } from '../lib/dateFilters';

export const logAction = async ({ actor, action, targetType, targetId, details }) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      adminUid: actor?.uid || null,
      adminEmail: actor?.email || null,
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

export const buildAuditLogsQuery = (filters = {}) =>
  query(collection(db, 'audit_logs'), ...clausesPlageDate('createdAt', filters.debut, filters.fin), orderBy('createdAt', 'desc'));

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocs, limit, query, startAfter } from 'firebase/firestore';

const DEFAULT_PAGE_SIZE = 20;

// buildQuery() doit renvoyer une Query Firestore (collection + where/orderBy),
// sans limit/startAfter — ce hook s'en charge. deps déclenche un reset à la page 0
// (nouveaux filtres). Navigation séquentielle uniquement (pas de saut de page,
// Firestore ne le permet pas nativement).
export function useFirestorePagination(buildQuery, deps = [], pageSize = DEFAULT_PAGE_SIZE) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState(null);
  const cursors = useRef([]);
  // Numéro de la dernière requête lancée : si une réponse plus ancienne revient après
  // une plus récente (changement rapide de filtre, double-clic sur "suivant"), elle est
  // ignorée au lieu d'écraser les lignes déjà affichées avec des données périmées.
  const requestId = useRef(0);

  const fetchPage = useCallback(async (index) => {
    const myRequestId = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const constraints = [limit(pageSize + 1)];
      if (index > 0 && cursors.current[index - 1]) constraints.push(startAfter(cursors.current[index - 1]));
      const snap = await getDocs(query(buildQuery(), ...constraints));
      if (myRequestId !== requestId.current) return;
      const docs = snap.docs;
      const hasNext = docs.length > pageSize;
      const pageDocs = hasNext ? docs.slice(0, pageSize) : docs;
      cursors.current[index] = pageDocs[pageDocs.length - 1];
      setRows(pageDocs.map((d) => ({ id: d.id, ...d.data() })));
      setHasMore(hasNext);
      setPageIndex(index);
    } catch (err) {
      if (myRequestId !== requestId.current) return;
      console.error('useFirestorePagination a échoué :', err);
      setError(err.message || String(err));
      setRows([]);
      setHasMore(false);
    } finally {
      if (myRequestId === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    cursors.current = [];
    fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    rows,
    loading,
    error,
    hasMore,
    hasPrev: pageIndex > 0,
    page: pageIndex,
    nextPage: () => fetchPage(pageIndex + 1),
    prevPage: () => fetchPage(pageIndex - 1),
    refresh: () => fetchPage(pageIndex),
  };
}

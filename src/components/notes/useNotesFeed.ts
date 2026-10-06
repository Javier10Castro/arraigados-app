import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { NoteFeedItem } from '../../../shared/api';

/**
 * Notas de OTROS asistentes para el carrusel de /home (5 oct 2026).
 * GET /api/notes/feed con x-pulse-token. Se refresca solo cada minuto y al volver a
 * la pestaña (sin parpadear: solo la primera carga muestra "cargando"), y deja de
 * mostrar una nota cuando su `expiresAt` pasa, sin esperar al siguiente refresco.
 * Si falla, el carrusel sigue funcionando con tu propia nota (el error no estorba).
 */
export type FeedStatus = 'loading' | 'ready' | 'error';

const REFRESH_MS = 60_000;

export function useNotesFeed(token: string) {
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [items, setItems] = useState<NoteFeedItem[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api.notesFeed(token);
      setItems(r.notes);
      setStatus('ready');
    } catch {
      // Un refresco fallido no borra lo que ya se ve; solo marca error si nunca cargó.
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      setNow(Date.now());
      void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Likes: el corazón cambia al instante (optimista) y se concilia con lo que responde el
  // servidor; si falla, vuelve a como estaba. Un solo envío a la vez por nota.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pending = useRef(new Set<string>());
  const patch = (id: string, fn: (n: NoteFeedItem) => NoteFeedItem) =>
    setItems((list) => list.map((n) => (n.id === id ? fn(n) : n)));

  /** mode 'like' = solo dar like (doble toque; si ya lo tenía no hace nada) · 'toggle' = el botón. */
  const like = useCallback(
    async (id: string, mode: 'like' | 'toggle') => {
      const cur = itemsRef.current.find((n) => n.id === id);
      if (!cur || pending.current.has(id)) return;
      if (mode === 'like' && cur.likedByMe) return;
      pending.current.add(id);
      const target = !cur.likedByMe;
      patch(id, (n) => ({ ...n, likedByMe: target }));
      try {
        const r = await api.toggleNoteLike(token, id);
        patch(id, (n) => ({ ...n, likedByMe: r.liked }));
      } catch {
        patch(id, (n) => ({ ...n, likedByMe: cur.likedByMe }));
      } finally {
        pending.current.delete(id);
      }
    },
    [token],
  );

  const visible = useMemo(() => items.filter((n) => new Date(n.expiresAt).getTime() > now), [items, now]);
  return { status, items: visible, reload: load, like };
}

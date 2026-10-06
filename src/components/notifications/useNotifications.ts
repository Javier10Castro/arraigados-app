import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { AppNotification } from '../../../shared/notifications';

/**
 * Campana de /home (5 oct 2026). GET /api/notifications con x-pulse-token; se refresca cada
 * minuto y al volver a la pestaña. Abrir la campana (`markSeen`) marca todo como leído en el
 * servidor, pero las filas que eran nuevas siguen resaltadas mientras el panel está abierto
 * (`freshIds`). Un fallo nunca rompe /home: la campana simplemente queda sin avisos.
 */
const REFRESH_MS = 60_000;

export function useNotifications(token: string) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api.notifications(token);
      setItems(r.items);
      setUnread(r.unread);
      setLoaded(true);
    } catch {
      /* se conserva lo que ya se veía */
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  /** Al abrir: recuerda cuáles eran nuevas y avisa al servidor. */
  const markSeen = useCallback(async () => {
    setFreshIds(new Set(itemsRef.current.filter((i) => i.unread).map((i) => `${i.kind}-${i.id}`)));
    setUnread(0);
    if (!token) return;
    try {
      await api.notificationsSeen(token);
    } catch {
      /* la próxima apertura lo reintenta */
    }
  }, [token]);

  const clearFresh = useCallback(() => setFreshIds(new Set()), []);

  return { items, unread, freshIds, loaded, markSeen, clearFresh };
}

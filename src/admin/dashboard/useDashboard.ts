import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { DASHBOARD_REFRESH_MS, type DashboardFilters, type DashboardResponse } from '../../../shared/api';

/**
 * Datos del Dashboard con actualización automática (polling, sin WebSockets):
 * - Pide los datos al montar y cada vez que cambian los filtros.
 * - Cada DASHBOARD_REFRESH_MS (60 s) vuelve a pedirlos, solo con la pestaña visible.
 * - Al volver a la pestaña, si los datos tienen más de 60 s, refresca de inmediato.
 * - Si un refresco falla, CONSERVA los datos anteriores y expone el error
 *   (la pantalla muestra "Sin conexión" y la hora de los últimos datos buenos).
 * - Respuestas viejas que llegan tarde se descartan (contador de petición).
 * - Al CAMBIAR los filtros se borran los datos anteriores (⇒ esqueleto): no se
 *   muestran números del filtro anterior como si fueran del nuevo. El refresco
 *   automático (mismos filtros) NO borra nada: actualiza en su lugar.
 */
export function useDashboard(filters: DashboardFilters) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify(filters);

  const refresh = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    api
      .dashboard(JSON.parse(key) as DashboardFilters)
      .then((r) => {
        if (id !== seq.current) return;
        setData(r);
        setError('');
        setUpdatedAt(Date.now());
      })
      .catch((err: Error) => {
        if (id !== seq.current) return;
        setError(err.message);
      })
      .finally(() => id === seq.current && setLoading(false));
  }, [key]);

  // Filtros nuevos → sin datos (esqueleto) → datos nuevos.
  useEffect(() => {
    setData(null);
    setError('');
    refresh();
  }, [refresh]);

  // Polling + regreso a la pestaña.
  const updatedRef = useRef(updatedAt);
  updatedRef.current = updatedAt;
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(tick, DASHBOARD_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const last = updatedRef.current;
      if (!last || Date.now() - last >= DASHBOARD_REFRESH_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { data, error, loading, updatedAt, refresh };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { DashboardFilters, DashboardResponse } from '../../../shared/api';

/**
 * Datos del Dashboard — SIN actualización automática (decisión del 2 oct
 * 2026: el polling cada 60 s generaba ~21 consultas SQL por pestaña abierta
 * de forma constante durante todo el horario del congreso, independiente de
 * si alguien estaba mirando los números o no. Ver docs/CLAUDE_HANDOFF.md).
 *
 * - Pide los datos UNA vez al montar y cada vez que cambian los filtros.
 * - No hay `setInterval` ni refresco al volver a la pestaña: el usuario pide
 *   datos nuevos presionando "Actualizar" (ver botón en Dashboard.tsx).
 * - Mientras una petición está en curso, `loading` es true: la pantalla
 *   deshabilita el botón "Actualizar" para que varios clics seguidos no
 *   generen varias solicitudes simultáneas.
 * - Si un refresco falla, CONSERVA los datos anteriores y expone el error
 *   (la pantalla muestra "Sin conexión" y la hora de los últimos datos buenos).
 * - Respuestas viejas que llegan tarde se descartan (contador de petición).
 * - Al CAMBIAR los filtros se borran los datos anteriores (⇒ esqueleto): no se
 *   muestran números del filtro anterior como si fueran del nuevo. Pedir un
 *   refresco manual con los MISMOS filtros NO borra nada: actualiza en su lugar.
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

  // Única carga automática: al montar y cada vez que cambian los filtros.
  // Filtros nuevos → sin datos (esqueleto) → datos nuevos.
  useEffect(() => {
    setData(null);
    setError('');
    refresh();
  }, [refresh]);

  return { data, error, loading, updatedAt, refresh };
}

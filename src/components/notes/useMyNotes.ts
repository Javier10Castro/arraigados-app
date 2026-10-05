import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { Note } from '../../../shared/api';

/**
 * Datos de las Notas del asistente para /home (5 oct 2026) -- SOLO frontend.
 *
 * Usa el backend tal cual existe hoy (GET/POST /api/notes con x-pulse-token).
 * Ese endpoint devuelve el HISTORIAL completo (activas y expiradas, la más
 * reciente primero), no una "nota activa", así que aquí se deriva:
 *   nota activa = la más reciente cuyo `expiresAt` todavía no pasó.
 *
 * "Reemplazar" una nota = publicar otra: el servidor hace expirar la anterior
 * en la misma operación (queda en el historial). "Quitar" = DELETE /api/notes:
 * la nota activa expira ya; tampoco se borra la fila.
 */

export type NotesStatus = 'loading' | 'ready' | 'error';

/** Mayor retardo que acepta setTimeout (~24.8 días). */
const MAX_TIMEOUT = 2_147_483_647;

export function useMyNotes(token: string) {
  const [status, setStatus] = useState<NotesStatus>('loading');
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!token) return;
    setStatus('loading');
    try {
      const r = await api.myNotes(token);
      setNotes(r.notes);
      setError('');
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar tus notas.');
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // La burbuja desaparece sola cuando la nota activa expira (sin recargar).
  const active = useMemo(
    () => notes.find((n) => new Date(n.expiresAt).getTime() > now) ?? null,
    [notes, now],
  );
  useEffect(() => {
    if (!active) return;
    const ms = new Date(active.expiresAt).getTime() - Date.now();
    const t = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(ms, 0) + 250, MAX_TIMEOUT));
    return () => window.clearTimeout(t);
  }, [active]);

  /** Marca como vencidas (localmente) las notas activas: espejo de lo que hace el servidor. */
  const retireLocal = (list: Note[]) => {
    const t = Date.now();
    const expired = new Date(t - 1000).toISOString();
    return list.map((n) => (new Date(n.expiresAt).getTime() > t ? { ...n, expiresAt: expired } : n));
  };

  /** Publica una nota nueva; el servidor retira la anterior. Lanza si falla. */
  const publish = useCallback(
    async (text: string) => {
      const r = await api.createNote(token, { text });
      setNotes((prev) => [r.note, ...retireLocal(prev)]);
      setNow(Date.now());
      return r.note;
    },
    [token],
  );

  /** Quita la nota activa (expira ya; sigue en el historial). Lanza si falla. */
  const remove = useCallback(async () => {
    await api.removeMyNote(token);
    setNotes((prev) => retireLocal(prev));
    setNow(Date.now());
  }, [token]);

  return { status, error, notes, active, now, reload: load, publish, remove };
}

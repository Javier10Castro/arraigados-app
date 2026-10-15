import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { usePulseSession } from './PulseSession';
import type { AttendeeProfileView } from '../../shared/profile';

/**
 * Directorio de perfiles (foto / avatar / iniciales) de las personas que aparecen en pantalla.
 *
 * <UserAvatar attendeeId=…> pide aquí el perfil de esa persona: las peticiones de todos los avatares
 * visibles se juntan en UNA llamada (POST /api/profiles) y el resultado se guarda en memoria unos minutos.
 * Solo aparecen quienes personalizaron su perfil; el resto se dibuja como siempre (ajuste global del Admin).
 *
 * Credencial de la llamada: el token de la pulsera del asistente, o la sesión del staff (cookie) en el panel.
 * El perfil propio llega ya dentro de /api/me y se siembra al instante; al guardar (`setMyProfile`)
 * se actualiza sin esperar, así todas las pantallas cambian solas.
 * Un fallo de red nunca rompe nada: el avatar simplemente se ve como siempre.
 */

type Entry = { profile: AttendeeProfileView | null; at: number };

const TTL_MS = 3 * 60_000;
const BATCH = 60;
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const queued = new Set<string>();
const inflight = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let token = '';
let epoch = 0;

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function set(id: string, profile: AttendeeProfileView | null, at = Date.now()) {
  entries.set(id, { profile, at });
}

async function flush() {
  timer = undefined;
  const ids = [...queued].slice(0, BATCH);
  ids.forEach((id) => {
    queued.delete(id);
    inflight.add(id);
  });
  if (queued.size) timer = setTimeout(flush, 40);
  if (!ids.length) return;
  const mine = epoch;
  try {
    const r = await api.profiles(ids, token || undefined);
    if (mine !== epoch) return; // cambió la sesión mientras tanto: esta respuesta ya no aplica
    for (const id of ids) set(id, r.profiles[id] ?? null);
  } catch {
    if (mine !== epoch) return;
    for (const id of ids) set(id, entries.get(id)?.profile ?? null); // se conserva lo que había; se reintenta tras el TTL
  } finally {
    ids.forEach((id) => inflight.delete(id));
    emit();
  }
}

function want(id: string) {
  const e = entries.get(id);
  if (e && Date.now() - e.at < TTL_MS) return;
  if (queued.has(id) || inflight.has(id)) return;
  queued.add(id);
  timer ??= setTimeout(flush, 40);
}

/** Perfil guardado de esa persona (null = aún no personalizó o todavía cargando → se dibuja como siempre). */
export function useProfile(attendeeId: string | null | undefined): AttendeeProfileView | null {
  const entry = useSyncExternalStore(
    subscribe,
    () => (attendeeId ? entries.get(attendeeId) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (attendeeId) want(attendeeId);
  }, [attendeeId, entry]);
  return entry?.profile ?? null;
}

/** El asistente acaba de guardar su perfil: se refleja en todas las pantallas sin esperar. */
export function setMyProfile(attendeeId: string, profile: AttendeeProfileView | null) {
  set(attendeeId, profile);
  emit();
}

/** Mantiene el directorio sincronizado con la sesión del asistente (va una sola vez, en main.tsx). */
export function ProfileDirectorySync({ children }: { children: ReactNode }) {
  const { state } = usePulseSession();
  const sessionToken = state.phase === 'ready' ? state.token : '';
  const me = state.phase === 'ready' ? state.me : null;

  useEffect(() => {
    if (sessionToken === token) return;
    token = sessionToken;
    epoch += 1; // otra persona / sin sesión: no se reutiliza nada de la anterior
    entries.clear();
    queued.clear();
    inflight.clear();
    emit();
  }, [sessionToken]);

  useEffect(() => {
    if (me) {
      set(me.attendee.id, me.profile ?? null);
      emit();
    }
  }, [me]);

  return <>{children}</>;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse, StaffMeResponse } from '../../shared/api';
import { ApiRequestError, api } from '../lib/api';

/**
 * Sesión del ASISTENTE: el token de su pulsera guardado en este navegador
 * (decisión: opción A). No hay contraseña -- el token es la credencial, y el
 * servidor lo valida contra Neon en cada consulta. Escanear otra pulsera
 * reemplaza la sesión; "Cerrar sesión" la borra; volver a escanear la recupera.
 *
 * Staff/Admin tienen su propio login (Fase 2), separado de esto.
 *
 * VISTA DE VISITANTE DEL EQUIPO (híbrido): una cuenta Staff/Admin con pulsera propia puede ver la experiencia de
 * asistente SIN cerrar sesión ni crear otra cuenta. Esa vista NO usa el token de pulsera (no se guarda ni se pide):
 * sus datos salen de GET /api/staff-me, que se autentica con la cookie del equipo y solo devuelve LA pulsera de esa
 * cuenta. La bandera de sessionStorage solo recuerda que la pestaña estaba en esa vista (comodidad al recargar); NO
 * otorga nada: sin la cookie válida /api/staff-me responde 401 y la vista se descarta. En esta vista `state.token`
 * es '' (los hooks que necesitan token de asistente -notas, avisos- ya no hacen nada con token vacío).
 */

const STORAGE_KEY = 'arraigados.pulse.v1';
export const TEAM_VIEW_KEY = 'arraigados.teamview.v1';

function readTeamFlag(): boolean {
  try {
    return sessionStorage.getItem(TEAM_VIEW_KEY) === '1';
  } catch {
    return false;
  }
}
function writeTeamFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(TEAM_VIEW_KEY, '1');
    else sessionStorage.removeItem(TEAM_VIEW_KEY);
  } catch {
    // sin almacenamiento: la vista dura lo que la pestaña
  }
}

/** Convierte la pulsera propia del equipo en la forma que esperan las pantallas de asistente (sin identidad de asistente). */
function teamMe(r: Extract<StaffMeResponse, { state: 'active' }>): MeResponse {
  return {
    attendee: {
      id: `team-${r.member.id}`, // solo semilla de avatar
      fullName: r.member.name,
      ageRange: null,
      churchName: r.member.role === 'ADMIN' ? 'Equipo · Admin' : 'Equipo · Staff',
      presbyteryName: '',
      zoneName: '',
    },
    package: r.package,
    drinksUsed: r.drinksUsed,
    drinksRemaining: r.drinksRemaining,
  };
}

type State =
  | { phase: 'none' }
  | { phase: 'loading'; token: string }
  | { phase: 'ready'; token: string; me: MeResponse; team?: true; qrToken?: string }
  | { phase: 'error'; token: string; message: string }
  /** Vista de visitante del equipo sin pulsera utilizable (sin asignar o deshabilitada). */
  | { phase: 'team_blocked'; reason: 'none' | 'invalid' }
  /** La sesión del equipo caducó estando en la vista de visitante: se pide iniciar sesión (no se finge que sigue vigente). */
  | { phase: 'team_expired' };

type PulseSessionValue = {
  state: State;
  me: MeResponse | null;
  /** Guarda el token de una pulsera ACTIVA y carga sus datos. */
  setToken: (token: string) => void;
  /** Vuelve a leer los datos de Neon sin mostrar "Cargando…". */
  refresh: () => Promise<void>;
  signOut: () => void;
  /** true = se está viendo la experiencia de visitante con la pulsera de la cuenta del equipo (no un token de asistente). */
  isTeam: boolean;
  /** Entra a la vista de visitante del equipo. 'ok' | 'none' | 'invalid' | 'denied' (sin sesión de equipo) | 'error'. */
  enterTeamView: () => Promise<'ok' | 'none' | 'invalid' | 'denied' | 'error'>;
  /** Sale de la vista de visitante del equipo (no toca la sesión del equipo). */
  leaveTeamView: () => void;
};

const PulseSessionContext = createContext<PulseSessionValue | null>(null);

function readToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Navegador sin almacenamiento (modo privado estricto): la sesión dura lo que la pestaña.
  }
}

export function PulseSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => {
    if (readTeamFlag()) return { phase: 'loading', token: '' };
    const token = readToken();
    return token ? { phase: 'loading', token } : { phase: 'none' };
  });

  /** Carga la pulsera propia del equipo. Devuelve el resultado para quien la pidió. */
  const loadTeam = useCallback(async (silent = false, markExpired = true): Promise<'ok' | 'none' | 'invalid' | 'denied' | 'error'> => {
    try {
      const r = await api.staffOwnPulse();
      if (r.state === 'active') {
        setState({ phase: 'ready', token: '', me: teamMe(r), team: true, qrToken: r.qrToken });
        return 'ok';
      }
      setState({ phase: 'team_blocked', reason: r.state });
      return r.state;
    } catch (err) {
      if (err instanceof ApiRequestError && (err.httpStatus === 401 || err.httpStatus === 403)) {
        writeTeamFlag(false);
        setState(markExpired ? { phase: 'team_expired' } : { phase: 'none' }); // quien llama con markExpired=false navega a /login
        return 'denied';
      }
      if (!silent) setState({ phase: 'error', token: '', message: err instanceof Error ? err.message : 'No pudimos cargar tus datos.' });
      return 'error';
    }
  }, []);

  /** silent: recarga sin pasar por "Cargando…" (para refrescar el saldo de aguas frescas). */
  const load = useCallback(async (token: string, silent = false) => {
    if (!silent) setState({ phase: 'loading', token });
    try {
      const me = await api.me(token);
      setState({ phase: 'ready', token, me });
    } catch (err) {
      if (err instanceof ApiRequestError && err.httpStatus === 401) {
        // La pulsera ya no está activa (invalidada o inexistente): se olvida.
        writeToken(null);
        setState({ phase: 'none' });
        return;
      }
      if (silent) return; // sin conexión en un refresco: se conservan los datos que ya había
      setState({
        phase: 'error',
        token,
        message: err instanceof Error ? err.message : 'No pudimos cargar tus datos.',
      });
    }
  }, []);

  const startedInTeam = state.phase === 'loading' && state.token === '';
  const tokenToLoad = state.phase === 'loading' ? state.token : null;
  useEffect(() => {
    if (startedInTeam) void loadTeam();
    else if (tokenToLoad) void load(tokenToLoad);
    // Solo en el arranque; después setToken/refresh llaman a load directamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setToken = useCallback(
    (token: string) => {
      writeTeamFlag(false); // escanear una pulsera de asistente sustituye la vista del equipo
      writeToken(token);
      void load(token);
    },
    [load],
  );

  const isTeam = (state.phase === 'ready' && state.team === true) || state.phase === 'team_blocked';
  const currentToken = state.phase === 'none' || state.phase === 'team_blocked' || state.phase === 'team_expired' ? null : state.token;
  const refresh = useCallback(async () => {
    if (isTeam) await loadTeam(true);
    else if (currentToken) await load(currentToken, true);
  }, [currentToken, load, loadTeam, isTeam]);

  const signOut = useCallback(() => {
    writeToken(null);
    writeTeamFlag(false);
    setState({ phase: 'none' });
  }, []);

  const enterTeamView = useCallback(async () => {
    writeTeamFlag(true);
    const r = await loadTeam(false, false);
    if (r === 'denied' || r === 'error') writeTeamFlag(false);
    return r;
  }, [loadTeam]);

  const leaveTeamView = useCallback(() => {
    writeTeamFlag(false);
    // Vuelve a lo que haya en este navegador como asistente (si algo): la sesión del equipo no se toca.
    const t = readToken();
    if (t) {
      setState({ phase: 'loading', token: t });
      void load(t);
    } else {
      setState({ phase: 'none' });
    }
  }, [load]);

  const value = useMemo(
    () => ({ state, me: state.phase === 'ready' ? state.me : null, setToken, refresh, signOut, isTeam, enterTeamView, leaveTeamView }),
    [state, setToken, refresh, signOut, isTeam, enterTeamView, leaveTeamView],
  );

  return <PulseSessionContext.Provider value={value}>{children}</PulseSessionContext.Provider>;
}

export function usePulseSession() {
  const ctx = useContext(PulseSessionContext);
  if (!ctx) throw new Error('usePulseSession debe usarse dentro de <PulseSessionProvider>');
  return ctx;
}

/** Nombre corto para saludos: primer nombre. */
export function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Iniciales para el avatar en modo "Iniciales" (la usa UserAvatar): "Javier Castro" → "JC". */
export function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'A';
}

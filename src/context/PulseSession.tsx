import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse } from '../../shared/api';
import { ApiRequestError, api } from '../lib/api';

/**
 * Sesión del ASISTENTE: el token de su pulsera guardado en este navegador
 * (decisión: opción A). No hay contraseña -- el token es la credencial, y el
 * servidor lo valida contra Neon en cada consulta. Escanear otra pulsera
 * reemplaza la sesión; "Cerrar sesión" la borra; volver a escanear la recupera.
 *
 * Staff/Admin tienen su propio login (Fase 2), separado de esto.
 */

const STORAGE_KEY = 'arraigados.pulse.v1';

type State =
  | { phase: 'none' }
  | { phase: 'loading'; token: string }
  | { phase: 'ready'; token: string; me: MeResponse }
  | { phase: 'error'; token: string; message: string };

type PulseSessionValue = {
  state: State;
  me: MeResponse | null;
  /** Guarda el token de una pulsera ACTIVA y carga sus datos. */
  setToken: (token: string) => void;
  /** Vuelve a leer los datos de Neon sin mostrar "Cargando…". */
  refresh: () => Promise<void>;
  signOut: () => void;
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
    const token = readToken();
    return token ? { phase: 'loading', token } : { phase: 'none' };
  });

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

  const tokenToLoad = state.phase === 'loading' ? state.token : null;
  useEffect(() => {
    if (tokenToLoad) void load(tokenToLoad);
    // Solo en el arranque; después setToken/refresh llaman a load directamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setToken = useCallback(
    (token: string) => {
      writeToken(token);
      void load(token);
    },
    [load],
  );

  const currentToken = state.phase === 'none' ? null : state.token;
  const refresh = useCallback(async () => {
    if (currentToken) await load(currentToken, true);
  }, [currentToken, load]);

  const signOut = useCallback(() => {
    writeToken(null);
    setState({ phase: 'none' });
  }, []);

  const value = useMemo(
    () => ({ state, me: state.phase === 'ready' ? state.me : null, setToken, refresh, signOut }),
    [state, setToken, refresh, signOut],
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

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { StaffUser } from '../../shared/api';
import { ApiRequestError, api } from '../lib/api';

/**
 * Sesión de STAFF / ADMIN: cuentas de la tabla "User" de Neon (las mismas
 * del Next.js). La sesión vive en una cookie httpOnly que pone el servidor;
 * aquí solo se consulta quién es (/api/auth/me). Independiente de la sesión
 * del asistente (pulsera).
 */

type State = { phase: 'loading' } | { phase: 'none' } | { phase: 'ready'; user: StaffUser } | { phase: 'error'; message: string };

type StaffSessionValue = {
  state: State;
  user: StaffUser | null;
  signIn: (email: string, password: string) => Promise<StaffUser>;
  signOut: () => Promise<void>;
  reload: () => void;
  /** Cambia la contraseña de la sesión (obligatorio si es temporal). */
  changePassword: (currentPassword: string, newPassword: string) => Promise<StaffUser>;
};

const StaffSessionContext = createContext<StaffSessionValue | null>(null);

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  const reload = useCallback(() => {
    setState({ phase: 'loading' });
    api
      .staffMe()
      .then((user) => setState({ phase: 'ready', user }))
      .catch((err) => {
        if (err instanceof ApiRequestError && err.httpStatus === 401) setState({ phase: 'none' });
        else setState({ phase: 'error', message: err instanceof Error ? err.message : 'No pudimos verificar tu sesión.' });
      });
  }, []);

  useEffect(reload, [reload]);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await api.login({ email, password });
    setState({ phase: 'ready', user });
    return user;
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setState({ phase: 'none' });
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const user = await api.changePassword({ currentPassword, newPassword });
    setState({ phase: 'ready', user });
    return user;
  }, []);

  const value = useMemo(
    () => ({ state, user: state.phase === 'ready' ? state.user : null, signIn, signOut, reload, changePassword }),
    [state, signIn, signOut, reload, changePassword],
  );
  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

/** A dónde va cada cuenta después de iniciar sesión. */
export function homeForRole(user: StaffUser) {
  if (user.mustChangePassword) return '/cuenta/contrasena';
  return user.role === 'ADMIN' ? '/admin' : '/staff';
}

export function useStaffSession() {
  const ctx = useContext(StaffSessionContext);
  if (!ctx) throw new Error('useStaffSession debe usarse dentro de <StaffSessionProvider>');
  return ctx;
}

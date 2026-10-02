import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Session = {
  name: string;
  initials: string;
  package: string;
  email: string;
};

type DemoUser = Session & { password: string };

export const DEMO_USERS: DemoUser[] = [
  { email: 'javier@redjuvenil.mx', password: 'arraigados26', name: 'Javier', initials: 'J', package: 'PAQUETE C' },
  { email: 'diana@redjuvenil.mx', password: 'arraigados26', name: 'Diana', initials: 'D', package: 'PAQUETE B' },
];

const STORAGE_KEY = 'arraigados.session.v1';

type AuthContextValue = {
  session: Session | null;
  signIn: (email: string, password: string) => string | null;
  register: (name: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed && typeof parsed.name === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  const signIn = useCallback((email: string, password: string) => {
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return 'No encontramos una cuenta con ese correo.';
    if (user.password !== password) return 'La contraseña no coincide.';
    const { password: _pw, ...safe } = user;
    setSession(safe);
    return null;
  }, []);

  const register = useCallback((name: string) => {
    const clean = name.trim() || 'Invitado';
    setSession({
      name: clean,
      initials: clean.charAt(0).toUpperCase(),
      package: 'PAQUETE C',
      email: 'registro@redjuvenil.mx',
    });
  }, []);

  const signOut = useCallback(() => setSession(null), []);

  const value = useMemo(() => ({ session, signIn, register, signOut }), [session, signIn, register, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

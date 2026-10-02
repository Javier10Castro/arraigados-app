import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { DEFAULT_AVATAR_MODE, isAvatarMode, type AvatarMode } from '../../shared/api';

/**
 * Configuración GLOBAL de la app (hoy solo el modo de avatar), disponible en
 * todas las pantallas: asistente, Staff y Admin.
 *
 * - La fuente de verdad es el servidor (GET /api/settings → server/settings.ts).
 * - Se guarda una copia en localStorage SOLO para no "parpadear" al abrir la
 *   app (primero se pinta el último valor conocido y luego llega el real).
 *   Si localStorage falla o está vacío, se usa el valor por defecto.
 * - Se vuelve a consultar al regresar a la pestaña, así un cambio del Admin
 *   llega a las demás pantallas sin recargar.
 * - `setAvatarMode` (solo ADMIN; el servidor lo vuelve a comprobar) guarda y
 *   actualiza el estado de inmediato: todos los `UserAvatar` cambian solos.
 */

const CACHE_KEY = 'arraigados.settings.v1';

type Ctx = {
  avatarMode: AvatarMode;
  /** true cuando ya llegó el valor del servidor. */
  loaded: boolean;
  setAvatarMode: (mode: AvatarMode) => Promise<void>;
};

const AppSettingsContext = createContext<Ctx>({
  avatarMode: DEFAULT_AVATAR_MODE,
  loaded: false,
  setAvatarMode: async () => {},
});

function readCache(): AvatarMode {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { avatarMode?: unknown } | null;
    return isAvatarMode(raw?.avatarMode) ? raw.avatarMode : DEFAULT_AVATAR_MODE;
  } catch {
    return DEFAULT_AVATAR_MODE;
  }
}

function writeCache(avatarMode: AvatarMode) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ avatarMode }));
  } catch {
    // modo privado / almacenamiento bloqueado: no pasa nada, el servidor manda
  }
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [avatarMode, setMode] = useState<AvatarMode>(readCache);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((mode: AvatarMode) => {
    setMode(mode);
    writeCache(mode);
  }, []);

  const refresh = useCallback(() => {
    api
      .settings()
      .then((s) => {
        apply(s.avatarMode);
        setLoaded(true);
      })
      .catch(() => {
        // Sin conexión: se queda el último valor conocido (o el de por defecto).
      });
  }, [apply]);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const setAvatarMode = useCallback(
    async (mode: AvatarMode) => {
      const saved = await api.updateSettings({ avatarMode: mode });
      apply(saved.avatarMode);
    },
    [apply],
  );

  const value = useMemo(() => ({ avatarMode, loaded, setAvatarMode }), [avatarMode, loaded, setAvatarMode]);
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export const useAppSettings = () => useContext(AppSettingsContext);

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { StaffMeResponse } from '../../shared/api';

/**
 * Estado de la pulsera PROPIA de la cuenta del equipo en sesión, tal como lo dice el servidor (GET /api/staff-me, que
 * deduce la cuenta de la cookie y lee "StaffPulse"). No usa localStorage: persiste en la base y por eso sobrevive a
 * cerrar sesión y a cambiar de dispositivo. Es solo para PINTAR (sidebar y pantalla «Vincular pulsera»); el servidor
 * decide los permisos en cada llamada.
 *   pending  = la cuenta no tiene pulsera
 *   linked   = tiene una pulsera vigente
 *   disabled = tiene una pero fue deshabilitada (solo un Admin puede arreglarlo)
 */
export type OwnPulseLink =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'pending' }
  | { phase: 'disabled' }
  | { phase: 'linked'; packageName: string; drinksRemaining: number; includedDrinks: number };

const fromServer = (r: StaffMeResponse): OwnPulseLink =>
  r.state === 'none'
    ? { phase: 'pending' }
    : r.state === 'invalid'
      ? { phase: 'disabled' }
      : { phase: 'linked', packageName: r.package.name, drinksRemaining: r.drinksRemaining, includedDrinks: r.package.includedDrinks };

export function useOwnPulseLink(): OwnPulseLink & { refresh: () => void } {
  const [state, setState] = useState<OwnPulseLink>({ phase: 'loading' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    api
      .staffOwnPulse()
      .then((r) => alive.current && setState(fromServer(r)))
      .catch((e: Error) => alive.current && setState({ phase: 'error', message: e.message || 'No pudimos consultar tu pulsera.' }));
  }, []);
  useEffect(refresh, [refresh]);

  return { ...state, refresh };
}

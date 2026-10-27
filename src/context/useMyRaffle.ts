import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { MyRaffleResponse } from '../../shared/api';
import { usePulseSession } from './PulseSession';

export type MyRaffleState =
  | { status: 'loading' }
  | { status: 'team' } // vista de visitante del equipo: el equipo no participa
  | { status: 'error'; message: string }
  | { status: 'ready'; data: MyRaffleResponse };

/**
 * La rifa del asistente (GET /api/raffle-entry). La identidad y el kit los resuelve el servidor con el token de la
 * pulsera; aquí solo se pinta. Lo usan /rifa y la tarjeta «Rifa» de /home.
 */
export function useMyRaffle() {
  const { state, isTeam } = usePulseSession();
  const token = state.phase === 'ready' ? state.token : '';
  const [raffle, setRaffle] = useState<MyRaffleState>({ status: 'loading' });

  const load = useCallback(async () => {
    if (isTeam) { setRaffle({ status: 'team' }); return; }
    if (!token) return;
    try {
      setRaffle({ status: 'ready', data: await api.myRaffle(token) });
    } catch (e) {
      setRaffle({ status: 'error', message: (e as Error).message });
    }
  }, [token, isTeam]);

  useEffect(() => { void load(); }, [load]);

  return { raffle, reload: load, token, setData: (data: MyRaffleResponse) => setRaffle({ status: 'ready', data }) };
}

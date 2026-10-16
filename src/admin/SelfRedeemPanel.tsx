import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { SelfRedeemMode, SelfRedeemOverview, StaffRole } from '../../shared/api';
import c from './SelfRedeemPanel.module.css';

/**
 * Admin -> Configuración: AUTOCANJE de Staff/Admin (escanear la propia pulsera para descontarse una agua).
 *  · Los dos interruptores globales los ve y cambia cualquier Admin.
 *  · La lista por persona (heredar / permitir / negar) SOLO llega del servidor a la cuenta propietaria; para cualquier
 *    otro Admin no se pinta nada y, aunque alguien llamara al endpoint a mano, el servidor responde 403.
 * Esta pantalla solo refleja lo que el servidor decide: ningún permiso depende de lo que aquí se muestre.
 */
const ROLE_LABEL: Record<StaffRole, { title: string; desc: string }> = {
  STAFF: { title: 'Permitir autocanje a Staff', desc: 'Una cuenta Staff con pulsera podrá escanear la suya.' },
  ADMIN: { title: 'Permitir autocanje a Admin', desc: 'Una cuenta Admin con pulsera podrá escanear la suya.' },
};
const MODES: { value: SelfRedeemMode | 'inherit'; label: string }[] = [
  { value: 'inherit', label: 'Heredar' },
  { value: 'allow', label: 'Permitir' },
  { value: 'deny', label: 'Negar' },
];

export default function SelfRedeemPanel() {
  const [data, setData] = useState<SelfRedeemOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .adminSelfRedeem()
      .then((r) => {
        setData(r);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const send = async (body: Parameters<typeof api.adminUpdateSelfRedeem>[0]) => {
    setBusy(true);
    setError('');
    try {
      setData(await api.adminUpdateSelfRedeem(body));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio.');
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <p className={c.error} role="alert">{error}</p> : null;

  return (
    <section className={c.card} aria-label="Autocanje de pulseras">
      <div className={c.head}>
        <h2 className={c.title}>Autocanje de pulseras</h2>
        <p className={c.sub}>
          Apagado por defecto. Que alguien del equipo no pueda canjearse a sí mismo no impide que OTRO miembro del equipo
          escanee su pulsera con el procedimiento normal.
        </p>
      </div>

      {(['STAFF', 'ADMIN'] as StaffRole[]).map((role) => (
        <div className={c.row} key={role}>
          <div className={c.label}>
            <strong>{ROLE_LABEL[role].title}</strong>
            <span>{ROLE_LABEL[role].desc}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.settings[role]}
            aria-label={ROLE_LABEL[role].title}
            className={c.switch}
            disabled={busy}
            onClick={() => void send({ scope: 'global', role, allowed: !data.settings[role] })}
          />
        </div>
      ))}

      {data.isOwner && data.users && (
        <>
          <div className={c.head}>
            <h3 className={c.title} style={{ fontSize: 16 }}>Excepciones por persona</h3>
            <p className={c.sub}>
              «Heredar» sigue el interruptor de su rol. «Permitir» y «Negar» mandan sobre el interruptor global. Solo tú
              (cuenta propietaria) ves y cambias esto.
            </p>
          </div>
          <ul className={c.users}>
            {data.users.map((u) => (
              <li className={c.userRow} key={u.userId}>
                <div className={c.who}>
                  <strong>
                    {u.name} · {u.role === 'ADMIN' ? 'Admin' : 'Staff'}
                    {!u.active ? ' (inactiva)' : ''}
                  </strong>
                  <span>{u.email}</span>
                  <span className={`${c.effective} ${u.effective ? c.yes : c.no}`}>
                    {u.effective ? 'Puede autocanjearse' : 'No puede autocanjearse'} ·{' '}
                    {u.source === 'override' ? 'por excepción' : 'por interruptor de su rol'}
                  </span>
                </div>
                <div className={c.seg} role="radiogroup" aria-label={`Excepción de ${u.name}`}>
                  {MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={(u.override ?? 'inherit') === m.value}
                      disabled={busy}
                      onClick={() => void send({ scope: 'user', userId: u.userId, mode: m.value })}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className={c.error} role="alert">{error}</p>}
    </section>
  );
}

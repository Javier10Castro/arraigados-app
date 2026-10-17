import { useCallback, useEffect, useRef, useState } from 'react';
import AdminShell from './AdminShell';
import { api, ApiRequestError } from '../lib/api';
import type { AdminRaffleDetail, AdminRafflesResponse, RaffleSummary } from '../../shared/api';
import c from './Rifas.module.css';

/**
 * Admin -> Rifas. Panel de control del sorteo. Todo lo importante pasa en el servidor:
 *  · «Sortear» pide UN ganador; el servidor lo elige, lo guarda y lo devuelve. Aquí nunca se elige a nadie.
 *  · Cada clic genera una llave (drawKey). Si la red falla se REUTILIZA la misma llave al reintentar, así un
 *    reintento o un doble clic jamás produce un segundo ganador.
 *  · No hay botón de reiniciar ni de borrar: una edición nueva es una rifa nueva y el historial se conserva.
 */
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Tijuana', dateStyle: 'short', timeStyle: 'medium' });

function RaffleCard({ r, onChanged }: { r: RaffleSummary; onChanged: () => void }) {
  const [detail, setDetail] = useState<AdminRaffleDetail | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState(String(r.targetWinners));
  const [confirm, setConfirm] = useState<null | 'normal' | 'extra' | 'cancel'>(null);
  const pending = useRef<{ key: string; extra: boolean } | null>(null);

  const view = detail ?? { ...r, winners: [] as AdminRaffleDetail['winners'] };
  const completed = view.status === 'COMPLETED';
  const cancelled = view.status === 'CANCELLED';
  const noOne = view.eligibleCount === 0;

  useEffect(() => setTarget(String(view.targetWinners)), [view.targetWinners]);

  const loadHistory = useCallback(async () => {
    try {
      setDetail(await api.adminRaffle(r.id));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [r.id]);

  useEffect(() => {
    if (showHistory) void loadHistory();
  }, [showHistory, loadHistory]);

  const draw = async (extra: boolean) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    // Reintento tras un fallo de red: misma llave => el servidor no sortea otro.
    if (!pending.current || pending.current.extra !== extra) pending.current = { key: newKey(), extra };
    try {
      const res = await api.drawRaffle(r.id, { drawKey: pending.current.key, extra });
      pending.current = null;
      setConfirm(null);
      setDetail(res.raffle);
      setShowHistory(true);
      setMsg({ ok: true, text: `Ganador confirmado por el servidor (#${res.winner.position}): ${res.winner.winnerName}${res.replay ? ' · (ya estaba registrado)' : ''}` });
      onChanged();
    } catch (e) {
      const status = e instanceof ApiRequestError ? e.httpStatus : 0;
      if (status !== 0) pending.current = null; // respuesta definitiva del servidor: la próxima vez es un sorteo nuevo
      setMsg({ ok: false, text: status === 0 ? `${(e as Error).message} Presiona de nuevo para reintentar (no se sorteará dos veces).` : (e as Error).message });
      if (status === 409) void loadHistory();
    } finally {
      setBusy(false);
    }
  };

  const cancelRaffle = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      setDetail(await api.cancelRaffle(r.id));
      setConfirm(null);
      setMsg({ ok: true, text: 'Rifa cancelada. Los ganadores y el historial se conservan.' });
      onChanged();
    } catch (e) {
      setConfirm(null);
      setMsg({ ok: false, text: (e as Error).message });
      void loadHistory(); // el estado real puede ser otro (completada, ya cancelada)
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const saveTarget = async () => {
    const n = Number(target);
    setBusy(true);
    setMsg(null);
    try {
      setDetail(await api.updateRaffleTarget(r.id, n));
      setMsg({ ok: true, text: 'Número de ganadores actualizado.' });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const targetChanged = Number(target) !== view.targetWinners;

  return (
    <article className={c.card} aria-label={view.name}>
      <header className={c.head}>
        <div>
          <h3 className={c.title}>{view.name}</h3>
          <p className={c.sub}>{view.kitName} · Edición {view.edition}</p>
        </div>
        <span className={completed || cancelled ? c.done : c.open}>{cancelled ? 'Cancelada' : completed ? 'Completada' : 'Abierta'}</span>
      </header>

      <dl className={c.stats}>
        <div><dt>Ganadores</dt><dd>{view.winnersCount} / {view.targetWinners}</dd></div>
        <div><dt>Participantes elegibles</dt><dd>{view.eligibleCount}</dd></div>
      </dl>

      <div className={c.actions}>
        {!completed && !cancelled && confirm === null && (
          <button type="button" className={c.spin} disabled={busy || noOne} onClick={() => setConfirm('normal')}>
            {busy ? 'Sorteando…' : 'Sortear ganador'}
          </button>
        )}
        {!completed && !cancelled && confirm === null && (
          <button type="button" className={c.ghost} disabled={busy} onClick={() => setConfirm('cancel')}>Cancelar rifa</button>
        )}
        {completed && !noOne && confirm === null && (
          <button type="button" className={c.extra} disabled={busy} onClick={() => setConfirm('extra')}>Sorteo extra…</button>
        )}
        {confirm === 'cancel' && (
          <span className={c.confirm} role="alertdialog" aria-label={`Confirmar cancelación de ${view.name}`}>
            ¿Cancelar la rifa «{view.name}»? Es irreversible: no se podrá sortear, editar ni reabrir. Los ganadores y el historial se conservan.
            <button type="button" className={c.spin} disabled={busy} onClick={() => void cancelRaffle()}>{busy ? 'Cancelando…' : 'Sí, cancelar rifa'}</button>
            <button type="button" className={c.ghost} disabled={busy} onClick={() => setConfirm(null)}>No, volver</button>
          </span>
        )}
        {(confirm === 'normal' || confirm === 'extra') && (
          <span className={c.confirm} role="alertdialog" aria-label={`Confirmar sorteo de ${view.name}`}>
            ¿Sortear {confirm === 'extra' ? 'un ganador EXTRA' : 'un ganador'} de «{view.name}»? El resultado es irreversible: se guarda y no se puede deshacer ni repetir.
            <button type="button" className={c.spin} disabled={busy} onClick={() => void draw(confirm === 'extra')}>
              {busy ? 'Sorteando…' : confirm === 'extra' ? 'Sí, sortear extra' : 'Sí, sortear'}
            </button>
            <button type="button" className={c.ghost} disabled={busy} onClick={() => setConfirm(null)}>Cancelar</button>
          </span>
        )}
        <a className={c.link} href={`/rifa/${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer">Abrir vista pública (proyector) ↗</a>
        <button type="button" className={c.ghost} onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          {showHistory ? 'Ocultar historial' : 'Ver historial'}
        </button>
      </div>
      {cancelled && <p className={c.note}>Rifa cancelada. No se puede sortear ni editar; los ganadores y el historial se conservan.</p>}
      {noOne && !cancelled && <p className={c.note}>{completed ? 'Ya no quedan participantes elegibles para un sorteo extra.' : 'No hay participantes elegibles: no se puede girar.'}</p>}

      {!completed && !cancelled && (
        <div className={c.targetRow}>
          <label>
            <span>Ganadores a sortear</span>
            <input type="number" min={view.winnersCount + 1} max={500} step={1} value={target} disabled={busy} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <button type="button" className={c.ghost} disabled={busy || !targetChanged} onClick={() => void saveTarget()}>Guardar</button>
        </div>
      )}

      {msg && <p className={msg.ok ? c.ok : c.bad} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

      {showHistory && (
        <div className={c.history}>
          {view.winners.length === 0 ? (
            <p className={c.note}>Todavía no hay ganadores.</p>
          ) : (
            <table className={c.table}>
              <thead><tr><th>#</th><th>Ganador</th><th>Fecha y hora</th><th>Sorteó</th></tr></thead>
              <tbody>
                {view.winners.map((w) => (
                  <tr key={w.position}>
                    <td>{w.position}</td>
                    <td>{w.winnerName}{w.extra && <em className={c.tag}>extra</em>}</td>
                    <td>{when(w.drawnAt)}</td>
                    <td>{w.drawnByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </article>
  );
}

export default function Rifas() {
  const [data, setData] = useState<AdminRafflesResponse | null>(null);
  const [error, setError] = useState('');
  const [kit, setKit] = useState('');
  const [target, setTarget] = useState('1');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const load = useCallback(() => {
    api.adminRaffles().then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (data && !kit && data.kits[0]) setKit(data.kits[0].id);
  }, [data, kit]);

  const create = async () => {
    setBusy(true);
    setCreateMsg('');
    try {
      await api.createRaffle({ packageId: kit, targetWinners: Number(target), name: name.trim() || undefined });
      setName('');
      load();
    } catch (e) {
      setCreateMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Rifas">
      <p className={c.lead}>
        Una rifa por kit. El ganador lo elige el <strong>servidor</strong> entre los asistentes con pulsera activa de ese kit (Staff y Admin no participan)
        y queda guardado. Los resultados no se borran; una edición nueva es una rifa nueva.
      </p>
      {error && <p className={c.bad} role="alert">{error}</p>}
      {data && !data.available && <p className={c.warn}>Las rifas aún no están habilitadas en esta base (falta aplicar la migración 014).</p>}

      {data?.available && (
        <section className={c.create} aria-label="Abrir rifa">
          <h2 className={c.h2}>Abrir rifa</h2>
          <div className={c.form}>
            <label><span>Kit</span>
              <select value={kit} onChange={(e) => setKit(e.target.value)} disabled={busy}>
                {data.kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </label>
            <label><span>Ganadores a sortear</span>
              <input type="number" min={1} max={500} step={1} value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy} />
            </label>
            <label className={c.grow}><span>Nombre (opcional)</span>
              <input value={name} maxLength={80} placeholder="Rifa Kit - A · Edición 1" onChange={(e) => setName(e.target.value)} disabled={busy} />
            </label>
            <button type="button" className={c.spin} disabled={busy || !kit} onClick={() => void create()}>Abrir rifa</button>
          </div>
          {createMsg && <p className={c.bad} role="alert">{createMsg}</p>}
        </section>
      )}

      {data?.available && data.raffles.length === 0 && <p className={c.note}>Todavía no hay rifas. Abre la primera arriba.</p>}
      <div className={c.list}>
        {data?.raffles.map((r) => <RaffleCard key={r.id} r={r} onChanged={load} />)}
      </div>
    </AdminShell>
  );
}

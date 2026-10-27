import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from './AdminShell';
import { api, ApiRequestError } from '../lib/api';
import type { AdminRaffleDetail, AdminRaffleEntriesResponse, AdminRafflesResponse, RaffleSummary } from '../../shared/api';
import { RAFFLE_QUESTIONS } from '../../shared/raffle';
import { prizeWithImage } from '../data/rafflePrizes';
import c from './Rifas.module.css';

/**
 * Admin -> Rifas. Panel de control del sorteo. Todo lo importante pasa en el servidor:
 *  · «Sortear» pide UN ganador; el servidor lo elige, lo guarda y lo devuelve. Aquí nunca se elige a nadie.
 *  · Cada clic genera una llave (drawKey). Si la red falla se REUTILIZA la misma llave al reintentar, así un
 *    reintento o un doble clic jamás produce un segundo ganador.
 *  · No hay botón de reiniciar ni de borrar: una edición nueva es una rifa nueva y el historial se conserva.
 *  · Migración 017: solo participan los INSCRITOS (respondieron las 3 preguntas en /rifa). Arriba se ve quién entró a
 *    cada rifa con sus respuestas. «Gana la salida #N»: cada «Sorteo» saca a una persona; gana la que sale en el lugar N.
 */
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Tijuana', dateStyle: 'short', timeStyle: 'medium' });

/** CSV para Excel (UTF-8 con BOM, separado por comas, todo entre comillas). */
function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** «Inscritos»: quién entró a cada rifa (por kit) con sus 3 respuestas, y el interruptor de inscripciones. */
function Inscritos({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<AdminRaffleEntriesResponse | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const load = useCallback(() => {
    api.adminRaffleEntries().then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (data && !data.kits.some((k) => k.packageId === tab) && data.kits[0]) setTab(data.kits[0].packageId);
  }, [data, tab]);

  const kit = data?.kits.find((k) => k.packageId === tab) ?? null;
  const rows = useMemo(() => {
    if (!kit) return [];
    const q = norm(search.trim());
    return q ? kit.entries.filter((e) => norm(`${e.fullName} ${e.churchName}`).includes(q)) : kit.entries;
  }, [kit, search]);

  const toggle = async (open: boolean) => {
    setBusy(true);
    try {
      const r = await api.setRaffleEntriesOpen(open);
      setData((d) => (d ? { ...d, entriesOpen: r.entriesOpen } : d));
      setConfirmClose(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const out = [['Kit', 'Nombre', 'Iglesia', 'Fecha', RAFFLE_QUESTIONS.liked, RAFFLE_QUESTIONS.plenary, RAFFLE_QUESTIONS.lesson, 'Participa en el sorteo']];
    for (const k of data.kits) for (const e of k.entries) out.push([k.kitName, e.fullName, e.churchName, when(e.createdAt), e.liked, e.plenary, e.lesson, e.eligible ? 'Sí' : 'No (pulsera inactiva)']);
    downloadCsv(`rifa-inscritos-${new Date().toISOString().slice(0, 10)}.csv`, out);
  };

  const total = data?.kits.reduce((n, k) => n + k.entries.length, 0) ?? 0;

  return (
    <section className={c.create} aria-label="Inscritos a la rifa">
      <div className={c.sectionHead}>
        <div>
          <h2 className={c.h2}>Inscritos</h2>
          <p className={c.note}>Quienes respondieron las 3 preguntas en la app. Solo ellos entran al sorteo de su kit.</p>
        </div>
        {data?.available && (
          <div className={c.entriesSwitch}>
            <span className={data.entriesOpen ? c.open : c.done}>{data.entriesOpen ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}</span>
            {data.entriesOpen ? (
              confirmClose ? (
                <span className={c.confirm} role="alertdialog" aria-label="Confirmar cierre de inscripciones">
                  ¿Cerrar? Ya nadie nuevo podrá entrar.
                  <button type="button" className={c.spin} disabled={busy} onClick={() => void toggle(false)}>Sí, cerrar</button>
                  <button type="button" className={c.ghost} disabled={busy} onClick={() => setConfirmClose(false)}>No</button>
                </span>
              ) : (
                <button type="button" className={c.ghost} disabled={busy} onClick={() => setConfirmClose(true)}>Cerrar inscripciones</button>
              )
            ) : (
              <button type="button" className={c.ghost} disabled={busy} onClick={() => void toggle(true)}>Abrir inscripciones</button>
            )}
          </div>
        )}
      </div>
      {error && <p className={c.bad} role="alert">{error}</p>}
      {data && !data.available && <p className={c.warn}>La inscripción con preguntas aún no está habilitada en esta base (falta aplicar la migración 017).</p>}
      {data?.available && (
        <>
          <div className={c.tabs} role="tablist" aria-label="Kits">
            {data.kits.map((k) => {
              const p = prizeWithImage(k.kitName);
              return (
                <button key={k.packageId} type="button" role="tab" aria-selected={tab === k.packageId} className={tab === k.packageId ? c.tabOn : c.tab} onClick={() => setTab(k.packageId)}>
                  {p && <img src={p.image.src} alt="" width={p.image.width} height={p.image.height} />}
                  <span>{k.kitName}</span>
                  <strong>{k.entries.length}</strong>
                </button>
              );
            })}
          </div>
          <div className={c.tools}>
            <input type="search" placeholder="Buscar por nombre o iglesia" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar inscrito" />
            <button type="button" className={c.ghost} onClick={() => { load(); onChanged(); }}>Actualizar</button>
            <button type="button" className={c.ghost} disabled={total === 0} onClick={exportCsv}>Descargar CSV ({total})</button>
          </div>
          {kit && kit.entries.length === 0 ? (
            <p className={c.note}>Todavía nadie del {kit.kitName} se ha inscrito.</p>
          ) : (
            <div className={c.history}>
              <table className={`${c.table} ${c.entriesTable}`}>
                <thead>
                  <tr><th>Nombre</th><th>Plenaria favorita</th><th>Lo que más le gustó</th><th>Enseñanza</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.attendeeId} className={e.eligible ? undefined : c.inactive}>
                      <td><strong>{e.fullName}</strong><span className={c.cellSub}>{e.churchName}</span>{!e.eligible && <em className={c.tagOff}>pulsera inactiva</em>}</td>
                      <td>{e.plenary.replace(/ — .*/, '')}<span className={c.cellSub}>{e.plenary.split(' — ')[1] ?? ''}</span></td>
                      <td>{e.liked}</td>
                      <td>{e.lesson}</td>
                      <td className={c.nowrap}>{when(e.createdAt)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className={c.note}>Sin resultados para «{search}».</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RaffleCard({ r, onChanged }: { r: RaffleSummary; onChanged: () => void }) {
  const [detail, setDetail] = useState<AdminRaffleDetail | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState(String(r.winningPosition ?? r.targetWinners));
  const [confirm, setConfirm] = useState<null | 'normal' | 'extra' | 'cancel'>(null);
  const pending = useRef<{ key: string; extra: boolean } | null>(null);

  const view = detail ?? { ...r, winners: [] as AdminRaffleDetail['winners'] };
  const completed = view.status === 'COMPLETED';
  const cancelled = view.status === 'CANCELLED';
  const noOne = view.eligibleCount === 0;
  const byPosition = view.winningPosition !== null; // «gana la salida #N» (017); null = rifa anterior: todas ganan
  const nextPos = view.winnersCount + 1;
  const prize = prizeWithImage(view.kitName);

  useEffect(() => setTarget(String(view.winningPosition ?? view.targetWinners)), [view.winningPosition, view.targetWinners]);

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
      const w = res.winner;
      setMsg({
        ok: true,
        text: `${w.winner ? '¡GANA!' : 'No gana'} · Salida #${w.position}${w.extra ? ' (extra)' : ''}: ${w.winnerName}${res.replay ? ' · (ya estaba registrado)' : ''}`,
      });
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
      setDetail(await api.updateRaffleTarget(r.id, byPosition ? { winningPosition: n } : { targetWinners: n }));
      setMsg({ ok: true, text: byPosition ? `Ahora gana la salida #${n}.` : 'Número de ganadores actualizado.' });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const targetChanged = Number(target) !== (view.winningPosition ?? view.targetWinners);

  return (
    <article className={c.card} aria-label={view.name}>
      <header className={c.head}>
        {prize && <img className={c.prizeThumb} src={prize.image.src} alt="" width={prize.image.width} height={prize.image.height} />}
        <div className={c.headText}>
          <h3 className={c.title}>{view.name}</h3>
          <p className={c.sub}>{view.kitName} · Edición {view.edition}{prize ? ` · Premio: ${prize.title}${prize.detail.startsWith('$') ? ` ${prize.detail}` : ''}` : ''}</p>
        </div>
        <span className={completed || cancelled ? c.done : c.open}>{cancelled ? 'Cancelada' : completed ? 'Completada' : 'Abierta'}</span>
      </header>

      <dl className={c.stats}>
        {byPosition ? (
          <div><dt>Salidas · gana la #{view.winningPosition}</dt><dd>{view.winnersCount} / {view.winningPosition}</dd></div>
        ) : (
          <div><dt>Ganadores</dt><dd>{view.winnersCount} / {view.targetWinners}</dd></div>
        )}
        <div><dt>Inscritos que pueden salir</dt><dd>{view.eligibleCount}</dd></div>
      </dl>

      <div className={c.actions}>
        {!completed && !cancelled && confirm === null && (
          <button type="button" className={c.spin} disabled={busy || noOne} onClick={() => setConfirm('normal')}>
            {busy ? 'Sorteando…' : 'Sorteo'}
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
            {confirm === 'extra'
              ? `¿Sorteo EXTRA de «${view.name}»? La persona que salga cuenta como ganadora.`
              : byPosition
                ? `¿Hacer el sorteo? Saldrá la persona #${nextPos}${nextPos === view.winningPosition ? ' — ¡esta GANA!' : ` (no gana; gana la #${view.winningPosition})`}.`
                : `¿Sortear un ganador de «${view.name}»?`}{' '}
            El resultado se guarda y no se puede deshacer ni repetir.
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
            <span>{byPosition ? 'Gana la salida #' : 'Ganadores a sortear'}</span>
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
              <thead><tr><th>Salida</th><th>Persona</th><th>Resultado</th><th>Fecha y hora</th><th>Sorteó</th></tr></thead>
              <tbody>
                {view.winners.map((w) => (
                  <tr key={w.position} className={w.winner ? c.winRow : undefined}>
                    <td>#{w.position}</td>
                    <td>{w.winnerName}{w.extra && <em className={c.tag}>extra</em>}</td>
                    <td>{w.winner ? <strong className={c.winTag}>Ganador</strong> : <span className={c.cellSub}>No gana</span>}</td>
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
  const [target, setTarget] = useState('1'); // «gana la salida #»
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const load = useCallback(() => {
    api.adminRaffles().then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // Solo los kits con premio tienen rifa (shared/raffle.ts); «Inscripción Domingo» no aparece.
  const raffleKits = useMemo(() => {
    const withPrize = (data?.kits ?? []).filter((k) => prizeWithImage(k.name) !== null);
    return withPrize.length ? withPrize : data?.kits ?? [];
  }, [data]);
  useEffect(() => {
    if (raffleKits.length && !raffleKits.some((k) => k.id === kit)) setKit(raffleKits[0].id);
  }, [raffleKits, kit]);

  const create = async () => {
    setBusy(true);
    setCreateMsg('');
    try {
      await api.createRaffle({ packageId: kit, winningPosition: Number(target), name: name.trim() || undefined });
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
        Una rifa por kit. Participan solo los asistentes que <strong>entraron a la rifa</strong> respondiendo las 3 preguntas (Staff y Admin no participan).
        Cada <strong>Sorteo</strong> saca a una persona al azar en el <strong>servidor</strong> y queda guardada; gana la que salga en el lugar que elijas.
        Los resultados no se borran; una edición nueva es una rifa nueva.{' '}
        <a className={c.link} href="/premios" target="_blank" rel="noreferrer">Pantalla de premios ↗</a>
      </p>
      {error && <p className={c.bad} role="alert">{error}</p>}
      {data && !data.available && <p className={c.warn}>Las rifas aún no están habilitadas en esta base (falta aplicar la migración {data.missing ?? '014'}).</p>}

      {data && <Inscritos onChanged={load} />}

      {data?.available && (
        <section className={c.create} aria-label="Abrir rifa">
          <h2 className={c.h2}>Abrir rifa</h2>
          <div className={c.form}>
            <label><span>Kit</span>
              <select value={kit} onChange={(e) => setKit(e.target.value)} disabled={busy}>
                {raffleKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </label>
            <label><span>Gana la salida #</span>
              <input type="number" min={1} max={500} step={1} value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy} />
            </label>
            <label className={c.grow}><span>Nombre (opcional)</span>
              <input value={name} maxLength={80} placeholder="Rifa Kit - A · Edición 1" onChange={(e) => setName(e.target.value)} disabled={busy} />
            </label>
            <button type="button" className={c.spin} disabled={busy || !kit} onClick={() => void create()}>Abrir rifa</button>
          </div>
          <p className={c.note}>
            {Number(target) > 1
              ? `Las primeras ${Number(target) - 1} persona(s) que salgan no ganan; gana la #${Number(target)}.`
              : 'Gana la primera persona que salga.'}
            {(() => { const p = prizeWithImage(data.kits.find((k) => k.id === kit)?.name); return p ? ` Premio: ${p.title}${p.detail.startsWith('$') ? ` ${p.detail}` : ''}.` : ''; })()}
          </p>
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

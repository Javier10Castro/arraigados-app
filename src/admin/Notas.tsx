import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FIXED_BLOCKED, compileBlockedWords, hasBlockedLanguage } from '../../shared/moderation';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Heart, Pencil, ShieldBan, Search, X } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import { api } from '../lib/api';
import {
  NOTE_LIFETIME_HOURS,
  parsePageSize,
  type AdminAttendeesCatalog,
  type AdminNoteRow,
  type AdminNoteStatus,
  type AdminNotesLikesFilter,
  type AdminNotesResponse,
  type AdminNotesSort,
  type BlockedWord,
} from '../../shared/api';
import Pagination from '../components/Pagination';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';
import c from './Canjes.module.css';
import u from './Usuarios.module.css';
import n from './Notas.module.css';

/**
 * Admin -> Notas (5 oct 2026): las notas que escriben los asistentes en /home.
 * Aquí el Admin las revisa y MODERA: puede retirar una nota activa (con motivo;
 * queda Vencida, nunca se borra, y se registra en AuditLog) y administrar la lista
 * de palabras bloqueadas (se suman a la lista fija de shared/moderation.ts). El
 * asistente sigue publicando o quitando la suya; una nota quitada o reemplazada
 * también queda Vencida, así que el historial completo se conserva.
 *
 * Mismo esqueleto que Canjes/Asistentes: filtros en la URL, filtros/orden/
 * paginación en el SERVIDOR, estados loading/empty/error con esqueleto.
 *
 *  - Buscador: texto de la nota o nombre del asistente (sin acentos).
 *  - Estado: Todas · Activas · Vencidas.
 *  - Likes: Todos · Con likes · Sin likes (la tabla NoteLike existe, aunque la
 *    app ya no ofrece dar like -- se muestran por si se retoma).
 *  - Zona → Presbiterio → Iglesia (en cascada), rango de fechas y orden.
 *  - Los totales de arriba son de TODAS las notas, sin filtros.
 */

const COL_CLASSES = [a.wide, undefined, undefined, undefined, n.likesCol, d.act];

const STATUS_FILTERS: { value: AdminNoteStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'ACTIVA', label: 'Activas' },
  { value: 'VENCIDA', label: 'Vencidas' },
];

const LIKE_FILTERS: { value: AdminNotesLikesFilter | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'with', label: 'Con likes' },
  { value: 'without', label: 'Sin likes' },
];

/** "5 h", "35 min", "2 d" a partir de una diferencia en milisegundos. */
function span(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return 'menos de 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export default function Notas() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('estado') ?? '') as AdminNoteStatus | '';
  const likes = (params.get('likes') ?? '') as AdminNotesLikesFilter | '';
  const zoneId = params.get('zona') ?? '';
  const presbyteryId = params.get('presbiterio') ?? '';
  const churchId = params.get('iglesia') ?? '';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';
  const sort = (params.get('orden') === 'likes' ? 'likes' : 'recent') as AdminNotesSort;
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1);
  const pageSize = parsePageSize(params.get('porPagina'));

  const [text, setText] = useState(q);
  const [catalog, setCatalog] = useState<AdminAttendeesCatalog | null>(null);
  const [data, setData] = useState<AdminNotesResponse | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [retiring, setRetiring] = useState<AdminNoteRow | null>(null);
  const seq = useRef(0);

  const update = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!keepPage) next.delete('pagina');
    setParams(next, { replace: true });
  };

  // Búsqueda con pausa (no consulta en cada tecla).
  useEffect(() => {
    if (text.trim() === q) return;
    const t = window.setTimeout(() => update({ q: text.trim() }), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    api.attendeesCatalog().then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    const req = ++seq.current;
    setError('');
    setLoading(true);
    api
      .adminNotes({ q, status, likes, zoneId, presbyteryId, churchId, from, to, sort, page, pageSize })
      .then((r) => {
        if (req !== seq.current) return;
        setData(r);
        setNow(Date.now());
        if (r.total > 0 && r.page !== page) update({ pagina: String(r.page + 1) }, true);
      })
      .catch((err: Error) => req === seq.current && setError(err.message))
      .finally(() => req === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, likes, zoneId, presbyteryId, churchId, from, to, sort, page, pageSize, reload]);

  // Cascada: presbiterios de la zona elegida; iglesias del presbiterio (o de la zona).
  const presbyteries = useMemo(
    () => (catalog?.presbyteries ?? []).filter((p) => !zoneId || p.zoneId === zoneId),
    [catalog, zoneId],
  );
  const churches = useMemo(() => {
    const allowed = new Set(presbyteries.map((p) => p.id));
    return (catalog?.churches ?? []).filter((ch) => (presbyteryId ? ch.presbyteryId === presbyteryId : allowed.has(ch.presbyteryId)));
  }, [catalog, presbyteries, presbyteryId]);

  const hasFilters = Boolean(q || status || likes || zoneId || presbyteryId || churchId || from || to || sort === 'likes');
  const sum = data?.summary;

  return (
    <AdminShell title="Notas">
      <section className={n.kpis} aria-label="Resumen de notas" aria-busy={!sum}>
        <Kpi label="Notas" value={sum?.total} />
        <Kpi label="Activas ahora" value={sum?.active} tone="ok" />
        <Kpi label="Vencidas" value={sum?.expired} />
        <Kpi label="Asistentes con notas" value={sum?.authors} />
        <Kpi label="Likes" value={sum?.likes} />
      </section>

      <BlockedWordsPanel />

      <section className={`${d.card} ${a.filters}`} aria-label="Buscar y filtrar notas">
        <label className={a.search}>
          <Search size={17} aria-hidden="true" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar en la nota o por nombre del asistente…"
            aria-label="Buscar notas"
            autoComplete="off"
          />
          {text && (
            <button type="button" aria-label="Borrar búsqueda" onClick={() => setText('')}>
              <X size={16} />
            </button>
          )}
        </label>

        <div className={a.selects}>
          <Select label="Zona" value={zoneId} options={catalog?.zones ?? []} onChange={(v) => update({ zona: v, presbiterio: '', iglesia: '' })} />
          <Select label="Presbiterio" value={presbyteryId} options={presbyteries} onChange={(v) => update({ presbiterio: v, iglesia: '' })} />
          <Select label="Iglesia" value={churchId} options={churches} onChange={(v) => update({ iglesia: v })} />
          <label className={a.select}>
            <span>Orden</span>
            <select value={sort} onChange={(e) => update({ orden: e.target.value === 'likes' ? 'likes' : '' })}>
              <option value="recent">Más recientes</option>
              <option value="likes">Más likes</option>
            </select>
          </label>
          <label className={`${c.dates} ${n.dates}`}>
            <span>Del</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => update({ desde: e.target.value })} />
            <span>al</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => update({ hasta: e.target.value })} />
          </label>
        </div>

        <div className={n.chipRows}>
          <div className={a.chips} role="radiogroup" aria-label="Estado de la nota">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                role="radio"
                aria-checked={status === f.value}
                className={`${a.chip} ${status === f.value ? a.chipOn : ''}`}
                onClick={() => update({ estado: f.value })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className={a.chips} role="radiogroup" aria-label="Likes">
            {LIKE_FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                role="radio"
                aria-checked={likes === f.value}
                className={`${a.chip} ${likes === f.value ? a.chipOn : ''}`}
                onClick={() => update({ likes: f.value })}
              >
                {f.value === '' ? 'Likes: todos' : f.label}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              type="button"
              className={a.clear}
              onClick={() => {
                setText('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className={s.notice} role="alert">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={() => setReload((x) => x + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      <section className={d.card} aria-busy={loading}>
        <h2 className={d.cardTitle}>
          {loading ? <Skeleton w={150} h={18} /> : `${data?.total ?? 0} ${data?.total === 1 ? 'nota' : 'notas'}`}
        </h2>

        {!loading && !error && data && data.total === 0 && (
          <p className={s.hint}>{hasFilters ? 'Ninguna nota coincide con esa búsqueda o filtros.' : 'Todavía nadie ha escrito una nota.'}</p>
        )}

        {(loading || (data && data.total > 0)) && (
          <div className={d.tableWrap}>
            <table className={`${d.table} ${a.table}`}>
              <thead>
                <tr>
                  <th className={a.wide}>Publicada</th>
                  <th>Asistente</th>
                  <th>Nota</th>
                  <th>Estado</th>
                  <th className={n.likesCol}>Likes</th>
                  <th className={d.act}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading || !data ? (
                  <SkeletonRows
                    classNames={COL_CLASSES}
                    cols={['70%', '75%', '90%', 80, 30, 60]}
                    rows={data && data.total > 0 ? Math.min(pageSize, Math.max(data.total - page * pageSize, 1)) : pageSize}
                  />
                ) : (
                  data.rows.map((r) => <NoteRow key={r.id} row={r} now={now} onRetire={() => setRetiring(r)} />)
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <Pagination
            label="notas"
            page={page + 1}
            pageSize={pageSize}
            total={data.total}
            disabled={loading}
            onPageChange={(p) => update({ pagina: String(p) }, true)}
            onPageSizeChange={(x) => update({ porPagina: x === 10 ? '' : String(x) })}
          />
        )}
      </section>

      {retiring && (
        <RetireModal
          row={retiring}
          onClose={() => setRetiring(null)}
          onDone={() => {
            setRetiring(null);
            setReload((x) => x + 1);
          }}
        />
      )}
    </AdminShell>
  );
}

function NoteRow({ row, now, onRetire }: { row: AdminNoteRow; now: number; onRetire: () => void }) {
  const created = new Date(row.createdAt).getTime();
  const expires = new Date(row.expiresAt).getTime();
  const active = row.status === 'ACTIVA';
  // Una vencida antes de cumplir sus 24 h la quitó (o reemplazó) su autor.
  const early = !active && expires < created + (NOTE_LIFETIME_HOURS * 3600 - 120) * 1000;
  return (
    <tr>
      <td className={`${a.wide} ${a.date}`}>{shortDate(row.createdAt)}</td>
      <td>
        <Link to={`/admin/asistentes/${encodeURIComponent(row.attendeeId)}`} className={n.who}>
          {row.attendeeName}
        </Link>
        <span className={n.whoSub}>{row.churchName}</span>
      </td>
      <td>
        <span className={n.text}>{row.text}</span>
      </td>
      <td>
        {active ? (
          <span className={c.statusValid}>
            Activa
            <span className={c.voidMeta}>vence en {span(expires - now)}</span>
          </span>
        ) : (
          <span className={n.expired}>
            Vencida
            <span className={c.voidMeta}>
              {row.retiredByAdmin ? 'retirada por Admin' : early ? 'quitada o reemplazada' : `hace ${span(now - expires)}`}
            </span>
          </span>
        )}
      </td>
      <td className={n.likesCol}>
        <span className={`${n.likes} ${row.likeCount > 0 ? n.likesOn : ''}`}>
          <Heart size={14} strokeWidth={2.4} aria-hidden="true" /> {row.likeCount}
        </span>
      </td>
      <td className={d.act}>
        {active && (
          <Button size="sm" variant="outline" className={c.voidBtn} onClick={onRetire}>
            Retirar
          </Button>
        )}
      </td>
    </tr>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | undefined; tone?: 'ok' }) {
  return (
    <div className={`${n.kpi} ${tone === 'ok' ? n.kpiOk : ''}`}>
      <span className={n.kpiLabel}>{label}</span>
      {value === undefined ? <Skeleton w={44} h={26} /> : <strong className={n.kpiValue}>{value.toLocaleString('es-MX')}</strong>}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={a.select}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const REASON_MAX = 200;

/** Retirar una nota activa: motivo obligatorio; la nota queda Vencida (no se borra) y se registra en AuditLog. */
function RetireModal({ row, onClose, onDone }: { row: AdminNoteRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= REASON_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError('Escribe el motivo para retirar la nota.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.retireNote(row.id, { reason: trimmed });
      if (res.outcome === 'already_expired') {
        setError('Esta nota ya había vencido o fue retirada (quizá en otra pestaña).');
        setBusy(false);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar la nota. Intenta de nuevo.');
      setBusy(false);
    }
  }

  return (
    <AdminModal title="Retirar nota" onClose={onClose} busy={busy}>
      <form className={u.form} onSubmit={submit} noValidate>
        <p className={c.summary}>
          <b>{row.attendeeName}</b> · {row.churchName}
        </p>
        <p className={n.quote}>“{row.text}”</p>
        <p className={u.hint}>
          La nota deja de verse en el carrusel de inmediato y queda como <b>Vencida</b> (no se borra). El asistente puede publicar otra. Queda
          registrado quién la retiró y por qué.
        </p>
        <div className={c.reasonBox}>
          <label className={u.f}>
            <span>Motivo</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Lenguaje ofensivo."
              maxLength={REASON_MAX}
              autoFocus
            />
          </label>
          <p className={c.reasonCount}>
            {reason.length}/{REASON_MAX}
          </p>
        </div>
        {error && (
          <p className={u.error} role="alert">
            {error}
          </p>
        )}
        <div className={u.actions}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !canSubmit}>
            {busy ? 'Retirando…' : 'Retirar nota'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

/**
 * Palabras bloqueadas que administra el Admin. Se SUMAN a la lista fija del
 * código (shared/moderation.ts). Una palabra suelta coincide como palabra
 * completa; varias palabras, como frase. Al agregar una, las notas ya
 * publicadas que la contengan dejan de verse en el carrusel (el feed filtra
 * en cada consulta); al publicar, el servidor la rechaza.
 */
function BlockedWordsPanel() {
  // Abierto por defecto (5 oct 2026): antes iba colapsado y parecía que no había lista.
  const [open, setOpen] = useState(true);
  const [words, setWords] = useState<BlockedWord[] | null>(null);
  const [max, setMax] = useState(40);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [probe, setProbe] = useState('');
  const [showFixed, setShowFixed] = useState(false);
  const [fixedQ, setFixedQ] = useState('');

  useEffect(() => {
    if (!open || words) return;
    api
      .blockedWords()
      .then((r) => {
        setWords(r.words);
        setMax(r.max);
      })
      .catch((err: Error) => setError(err.message));
  }, [open, words]);

  const reloadList = () => api.blockedWords().then((r) => setWords(r.words));

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      if (ok) setInfo(ok);
      await reloadList();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar. Intenta de nuevo.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const w = text.trim();
    if (!w) return;
    let exists = false;
    const done = await run(async () => {
      const res = await api.addBlockedWord(w);
      exists = res.outcome === 'exists';
    });
    if (done) {
      setInfo(exists ? 'Esa palabra ya estaba en la lista.' : 'Agregada.');
      setText('');
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const done = await run(() => api.updateBlockedWord(editing.id, editing.value.trim()), 'Cambio guardado.');
    if (done) setEditing(null);
  }

  // Probador: usa EL MISMO filtro del servidor (lista fija + las palabras de abajo).
  const verdict = useMemo(() => {
    if (!probe.trim()) return null;
    return hasBlockedLanguage(probe, compileBlockedWords((words ?? []).map((w) => w.word)));
  }, [probe, words]);

  const fixedFiltered = useMemo(() => {
    const q = fixedQ.trim().toLowerCase();
    const f = (list: string[]) => (q ? list.filter((w) => w.includes(q)) : list);
    return { words: f(FIXED_BLOCKED.words), stems: f(FIXED_BLOCKED.stems), phrases: f(FIXED_BLOCKED.phrases) };
  }, [fixedQ]);

  return (
    <section className={d.card} aria-label="Palabras bloqueadas">
      <button type="button" className={n.panelHead} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ShieldBan size={18} aria-hidden="true" />
        <span>Palabras bloqueadas</span>
        <span className={n.panelHint}>
          {words ? `${words.length} tuyas · ${FIXED_BLOCKED.words.length} de la app` : ''} {open ? '· Ocultar' : '· Mostrar'}
        </span>
      </button>

      {open && (
        <div className={n.panelBody}>
          <p className={u.hint}>
            El filtro detecta variantes solas: MAYÚSCULAS, números por letras (p3nd3j0), letras repetidas, separadas por espacios o puntos, un
            carácter tachado (p*ta), letras de otro alfabeto, y k por c, v por b, ph por f. Funciona en español e inglés. Una palabra suelta
            se bloquea completa (no afecta a otras que la contengan); si escribes varias, se bloquea la frase.
          </p>

          <h3 className={n.subHead}>Agregadas por ti</h3>
          <form className={n.addRow} onSubmit={add}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Palabra o frase a bloquear"
              maxLength={max}
              aria-label="Palabra o frase a bloquear"
              autoComplete="off"
            />
            <Button type="submit" size="sm" disabled={busy || !text.trim()}>
              Agregar
            </Button>
          </form>
          {error && (
            <p className={u.error} role="alert">
              {error}
            </p>
          )}
          {info && <p className={n.info}>{info}</p>}
          {words === null && !error ? (
            <Skeleton w={220} h={18} />
          ) : words && words.length === 0 ? (
            <p className={s.hint}>Todavía no has agregado ninguna. Usa el campo de arriba.</p>
          ) : (
            <ul className={n.wordList}>
              {words?.map((w) => (
                <li key={w.id} className={n.word} title={w.createdByName ? `Agregada por ${w.createdByName}` : undefined}>
                  {editing?.id === w.id ? (
                    <form className={n.editForm} onSubmit={saveEdit}>
                      <input
                        value={editing.value}
                        onChange={(e) => setEditing({ id: w.id, value: e.target.value })}
                        maxLength={max}
                        aria-label={`Editar ${w.word}`}
                        autoFocus
                      />
                      <button type="submit" aria-label="Guardar cambio" disabled={busy || !editing.value.trim()}>
                        <Check size={14} />
                      </button>
                      <button type="button" aria-label="Cancelar edición" onClick={() => setEditing(null)}>
                        <X size={14} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span>{w.word}</span>
                      <button type="button" aria-label={`Editar ${w.word}`} disabled={busy} onClick={() => setEditing({ id: w.id, value: w.word })}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" aria-label={`Quitar ${w.word}`} disabled={busy} onClick={() => run(() => api.removeBlockedWord(w.id))}>
                        <X size={14} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h3 className={n.subHead}>Probar un texto</h3>
          <input
            className={n.probe}
            value={probe}
            onChange={(e) => setProbe(e.target.value)}
            placeholder="Escribe aquí para ver si se bloquearía (ej. con números o espacios)"
            aria-label="Probar un texto"
            autoComplete="off"
          />
          {verdict !== null && (
            <p className={verdict ? n.probeBad : n.probeOk} role="status">
              {verdict ? 'Se bloquearía.' : 'Se permitiría.'}
            </p>
          )}

          <button type="button" className={n.fixedToggle} aria-expanded={showFixed} onClick={() => setShowFixed((v) => !v)}>
            Lista de la app: {FIXED_BLOCKED.words.length} palabras, {FIXED_BLOCKED.stems.length} raíces, {FIXED_BLOCKED.phrases.length} frases (solo lectura){' '}
            {showFixed ? '· Ocultar' : '· Ver'}
          </button>
          {showFixed && (
            <div className={n.fixedBox}>
              <p className={u.hint}>
                Contiene lenguaje ofensivo. No se edita aquí: para quitar o cambiar una de estas, se modifica en el código (<code>shared/moderation.ts</code>).
              </p>
              <input
                className={n.probe}
                value={fixedQ}
                onChange={(e) => setFixedQ(e.target.value)}
                placeholder="Buscar en la lista de la app"
                aria-label="Buscar en la lista de la app"
                autoComplete="off"
              />
              <ul className={n.wordList}>
                {fixedFiltered.words.map((w) => (
                  <li key={`w-${w}`} className={`${n.word} ${n.wordFixed}`}>
                    <span>{w}</span>
                  </li>
                ))}
                {fixedFiltered.stems.map((w) => (
                  <li key={`s-${w}`} className={`${n.word} ${n.wordFixed}`} title="Raíz: bloquea toda palabra que empiece así">
                    <span>{w}…</span>
                  </li>
                ))}
                {fixedFiltered.phrases.map((w) => (
                  <li key={`p-${w}`} className={`${n.word} ${n.wordFixed}`}>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

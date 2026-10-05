import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart, Search, X } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
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
} from '../../shared/api';
import Pagination from '../components/Pagination';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';
import c from './Canjes.module.css';
import n from './Notas.module.css';

/**
 * Admin -> Notas (5 oct 2026): las notas que escriben los asistentes en /home.
 * SOLO LECTURA: aquí el Admin las revisa; el asistente es quien publica o quita
 * la suya (una nota "quitada" o reemplazada solo queda vencida, nunca se borra,
 * así que aparece aquí como Vencida y el historial completo se conserva).
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

const COL_CLASSES = [a.wide, undefined, undefined, undefined, n.likesCol];

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
                </tr>
              </thead>
              <tbody>
                {loading || !data ? (
                  <SkeletonRows
                    classNames={COL_CLASSES}
                    cols={['70%', '75%', '90%', 80, 30]}
                    rows={data && data.total > 0 ? Math.min(pageSize, Math.max(data.total - page * pageSize, 1)) : pageSize}
                  />
                ) : (
                  data.rows.map((r) => <NoteRow key={r.id} row={r} now={now} />)
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
    </AdminShell>
  );
}

function NoteRow({ row, now }: { row: AdminNoteRow; now: number }) {
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
            <span className={c.voidMeta}>{early ? 'quitada o reemplazada' : `hace ${span(now - expires)}`}</span>
          </span>
        )}
      </td>
      <td className={n.likesCol}>
        <span className={`${n.likes} ${row.likeCount > 0 ? n.likesOn : ''}`}>
          <Heart size={14} strokeWidth={2.4} aria-hidden="true" /> {row.likeCount}
        </span>
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

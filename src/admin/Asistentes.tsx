import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, CupSoda, Search, X } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import { api } from '../lib/api';
import { parsePageSize, type AdminAttendeesCatalog, type AdminAttendeesResponse, type DrinksFilter } from '../../shared/api';
import Pagination from '../components/Pagination';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';

/**
 * Admin → Asistentes (Etapa 4): lista de quienes ya se registraron.
 *
 * - Buscador por nombre (cada palabra, sin acentos) y filtros zona →
 *   presbiterio → iglesia (en cascada), kit y estado de sus aguas.
 * - Los filtros viven en la URL (?q=&zona=…): al volver del detalle se
 *   conservan, y se puede compartir/recargar la búsqueda.
 * - Clic en una fila → /admin/asistentes/:id.
 * - Paginación EN EL SERVIDOR (filtros → conteo → orden por registro → página):
 *   10 por página por defecto (?porPagina=10|25|50). Cualquier filtro o
 *   búsqueda regresa a la página 1; la búsqueda es sobre todos los asistentes.
 * - Estados: cargando → filas esqueleto; error → aviso; 0 → mensaje vacío.
 */

/** Clase de cada columna (las mismas para las filas esqueleto). */
const COL_CLASSES = [d.num, undefined, a.wide, a.wide, d.kitCol, undefined, a.wide, d.act];

const DRINK_FILTERS: { value: DrinksFilter | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'available', label: 'Con aguas' },
  { value: 'exhausted', label: 'Agotadas' },
  { value: 'none', label: 'Su kit no incluye' },
];

export default function Asistentes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const zoneId = params.get('zona') ?? '';
  const presbyteryId = params.get('presbiterio') ?? '';
  const churchId = params.get('iglesia') ?? '';
  const packageId = params.get('kit') ?? '';
  const drinks = (params.get('aguas') ?? '') as DrinksFilter | '';
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1);
  const pageSize = parsePageSize(params.get('porPagina'));

  const [text, setText] = useState(q);
  const [catalog, setCatalog] = useState<AdminAttendeesCatalog | null>(null);
  const [data, setData] = useState<AdminAttendeesResponse | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  /** Cambia filtros en la URL; cualquier cambio regresa a la página 1. */
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
    api
      .attendeesCatalog()
      .then(setCatalog)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const req = ++seq.current;
    setError('');
    setLoading(true);
    api
      .adminAttendees({ q, zoneId, presbyteryId, churchId, packageId, drinks, page, pageSize })
      .then((r) => {
        if (req !== seq.current) return;
        setData(r);
        // El servidor ajustó una página fuera de rango (p. ej. ?pagina=8 con 2 páginas).
        if (r.total > 0 && r.page !== page) update({ pagina: String(r.page + 1) }, true);
      })
      .catch((err: Error) => req === seq.current && setError(err.message))
      .finally(() => req === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, zoneId, presbyteryId, churchId, packageId, drinks, page, pageSize, reload]);

  // Cascada: presbiterios de la zona elegida; iglesias del presbiterio (o de la zona).
  const presbyteries = useMemo(
    () => (catalog?.presbyteries ?? []).filter((p) => !zoneId || p.zoneId === zoneId),
    [catalog, zoneId],
  );
  const churches = useMemo(() => {
    const allowed = new Set(presbyteries.map((p) => p.id));
    return (catalog?.churches ?? []).filter((c) => (presbyteryId ? c.presbyteryId === presbyteryId : allowed.has(c.presbyteryId)));
  }, [catalog, presbyteries, presbyteryId]);

  const hasFilters = Boolean(q || zoneId || presbyteryId || churchId || packageId || drinks);
  const from = `?${params.toString()}`;

  return (
    <AdminShell title="Asistentes">
      <section className={`${d.card} ${a.filters}`} aria-label="Buscar y filtrar asistentes">
        <label className={a.search}>
          <Search size={17} aria-hidden="true" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar por nombre"
            autoComplete="off"
          />
          {text && (
            <button type="button" aria-label="Borrar búsqueda" onClick={() => setText('')}>
              <X size={16} />
            </button>
          )}
        </label>

        <div className={a.selects}>
          <Select
            label="Zona"
            value={zoneId}
            options={catalog?.zones ?? []}
            onChange={(v) => update({ zona: v, presbiterio: '', iglesia: '' })}
          />
          <Select
            label="Presbiterio"
            value={presbyteryId}
            options={presbyteries}
            onChange={(v) => update({ presbiterio: v, iglesia: '' })}
          />
          <Select label="Iglesia" value={churchId} options={churches} onChange={(v) => update({ iglesia: v })} />
          <Select
            label="Kit"
            all="Todos"
            value={packageId}
            options={catalog?.packages ?? []}
            onChange={(v) => update({ kit: v })}
          />
        </div>

        <div className={a.chips} role="radiogroup" aria-label="Aguas frescas">
          {DRINK_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              role="radio"
              aria-checked={drinks === f.value}
              className={`${a.chip} ${drinks === f.value ? a.chipOn : ''}`}
              onClick={() => update({ aguas: f.value })}
            >
              {f.label}
            </button>
          ))}
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
          <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      <section className={d.card} aria-busy={loading}>
        <h2 className={d.cardTitle}>
          {loading ? (
            <Skeleton w={150} h={18} />
          ) : (
            `${data?.total ?? 0} ${data?.total === 1 ? 'asistente' : 'asistentes'}`
          )}
        </h2>

        {!loading && !error && data && data.total === 0 && (
          <p className={s.hint}>
            {hasFilters ? 'Nadie coincide con esa búsqueda o filtros.' : 'Todavía no se ha registrado nadie.'}
          </p>
        )}

        {(loading || (data && data.total > 0)) && (
          <div className={d.tableWrap}>
            <table className={`${d.table} ${a.table}`}>
              <thead>
                <tr>
                  <th className={d.num}>#</th>
                  <th>Nombre</th>
                  <th className={a.wide}>Iglesia</th>
                  <th className={a.wide}>Edad</th>
                  <th className={d.kitCol}>Kit</th>
                  <th>Aguas</th>
                  <th className={a.wide}>Registro</th>
                  <th className={d.act}>
                    <span className={d.srOnly}>Ver</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading || !data ? (
                  <SkeletonRows
                    classNames={COL_CLASSES}
                    cols={[18, '75%', '80%', 40, 52, 70, '60%', 18]}
                    rows={data && data.total > 0 ? Math.min(pageSize, Math.max(data.total - page * pageSize, 1)) : pageSize}
                  />
                ) : (
                  data.rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={a.rowLink}
                    tabIndex={0}
                    onClick={() => navigate(`/admin/asistentes/${r.id}`, { state: { from } })}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/asistentes/${r.id}`, { state: { from } })}
                  >
                    <td className={d.num}>{data.page * data.pageSize + i + 1}</td>
                    <td>
                      <span className={a.name}>{r.fullName}</span>
                      <span className={a.nameSub}>{r.churchName}</span>
                    </td>
                    <td className={a.wide}>
                      <span className={a.church}>{r.churchName}</span>
                      <span className={a.churchSub}>
                        {r.presbyteryName} · {r.zoneName}
                      </span>
                    </td>
                    <td className={a.wide}>{r.ageRange ?? (r.age != null ? `${r.age} años` : '—')}</td>
                    <td className={d.kitCol}>
                      <span className={d.kit}>{r.packageName}</span>
                    </td>
                    <td>
                      <Drinks total={r.includedDrinks} used={r.drinksUsed} />
                    </td>
                    <td className={`${a.wide} ${a.date}`}>{shortDate(r.createdAt)}</td>
                    <td className={d.act}>
                      <ChevronRight size={18} className={a.chev} aria-hidden="true" />
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <Pagination
            label="asistentes"
            page={page + 1}
            pageSize={pageSize}
            total={data.total}
            disabled={loading}
            onPageChange={(p) => update({ pagina: String(p) }, true)}
            onPageSizeChange={(n) => update({ porPagina: n === 10 ? '' : String(n) })}
          />
        )}
      </section>
    </AdminShell>
  );
}

function Select({
  label,
  all = 'Todas',
  value,
  options,
  onChange,
}: {
  label: string;
  all?: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={a.select}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Aguas en la tabla: vasitos (llenos = disponibles) + "2/3", o "No incluye". */
export function Drinks({ total, used }: { total: number; used: number }) {
  if (total === 0) return <span className={a.noDrinks}>No incluye</span>;
  const left = Math.max(total - used, 0);
  return (
    <span className={a.drinks} aria-label={`${left} de ${total} aguas frescas disponibles`}>
      {Array.from({ length: total }, (_, i) => (
        <CupSoda key={i} size={15} strokeWidth={2.2} className={i < left ? a.cupOn : a.cupOff} aria-hidden="true" />
      ))}
      <span className={left === 0 ? a.drinksOut : a.drinksNum}>
        {left}/{total}
      </span>
    </span>
  );
}

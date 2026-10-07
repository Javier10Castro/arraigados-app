import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import ConfirmTypeModal from './ConfirmTypeModal';
import HeaderDangerButton from './HeaderDangerButton';
import { api } from '../lib/api';
import { parsePageSize } from '../../shared/api';
import {
  AUDIT_CATEGORIES,
  auditCategory,
  auditDetails,
  auditEntityLink,
  auditEntityType,
  auditTarget,
  auditLabel,
  auditSummary,
  type AdminAuditResponse,
  type AdminAuditRow,
  type AuditCategory,
} from '../../shared/audit';
import Pagination from '../components/Pagination';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';
import n from './Notas.module.css';
import m from './Auditoria.module.css';

/**
 * Admin -> Auditoría (Etapa 8, 5 oct 2026): la bitácora de lo que se hace en la
 * plataforma (quién, cuándo, qué y sobre qué). SOLO LECTURA y solo ADMIN: lee la
 * tabla "AuditLog" que ya llenan Usuarios, Lotes, Asistentes, Staff (reemplazo de
 * pulsera), Canjes (anulaciones), Ajustes y la moderación de Notas.
 *
 * Mismo esqueleto que Notas/Canjes: filtros en la URL, filtros y paginación en el
 * SERVIDOR, esqueleto de carga, estado vacío y error con "Reintentar". El catálogo
 * acción -> texto en español vive en shared/audit.ts.
 *
 * Limitación conocida (docs/PLAN_PENDIENTES.md §6): hoy NO se registran los cambios
 * de menú ni de mercancía, ni los canjes nuevos (esos viven en su propia tabla).
 */

const COL_CLASSES = [a.wide, undefined, undefined, a.wide, d.act];

export default function Auditoria() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = (params.get('categoria') ?? '') as AuditCategory | '';
  const actorId = params.get('persona') ?? '';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1);
  const pageSize = parsePageSize(params.get('porPagina'));

  const [text, setText] = useState(q);
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [actors, setActors] = useState<AdminAuditResponse['actors']>([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AdminAuditRow | null>(null);
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
    const req = ++seq.current;
    setError('');
    setLoading(true);
    api
      .adminAudit({ q, category, actorId, from, to, page, pageSize })
      .then((r) => {
        if (req !== seq.current) return;
        setData(r);
        setActors(r.actors);
        if (r.total > 0 && r.page !== page) update({ pagina: String(r.page + 1) }, true);
      })
      .catch((err: Error) => req === seq.current && setError(err.message))
      .finally(() => req === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, actorId, from, to, page, pageSize, reload]);

  const [clearing, setClearing] = useState(false);
  const hasFilters = Boolean(q || category || actorId || from || to);
  const sum = data?.summary;

  return (
    <AdminShell
      title="Auditoría"
      action={
        data?.canClear ? (
          <HeaderDangerButton label="Vaciar bitácora" onClick={() => setClearing(true)} />
        ) : undefined
      }
    >
      <section className={n.kpis} aria-label="Resumen de la bitácora" aria-busy={!sum}>
        <Kpi label="Eventos registrados" value={sum?.total} />
        <Kpi label="Últimas 24 horas" value={sum?.last24h} tone="ok" />
        <Kpi label="Personas con actividad" value={sum?.actors} />
      </section>

      {data?.canClear && clearing && (
        <ConfirmTypeModal
          title="Vaciar bitácora"
          word="BORRAR BITACORA"
          actionLabel="Vaciar bitácora"
          onClose={() => setClearing(false)}
          onConfirm={async () => {
            await api.clearAudit('BORRAR BITACORA');
            setClearing(false);
            setParams(new URLSearchParams(), { replace: true });
            setText('');
            setReload((x) => x + 1);
          }}
        >
          <p>
            Se borrarán <strong>todos</strong> los registros de la bitácora ({sum?.total ?? '…'}). La bitácora queda
            completamente vacía y no se guarda ningún registro de este borrado. <strong>No se puede deshacer.</strong>
          </p>
        </ConfirmTypeModal>
      )}

      <section className={`${d.card} ${a.filters}`} aria-label="Buscar y filtrar la bitácora">
        <label className={a.search}>
          <Search size={17} aria-hidden="true" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar por persona, asistente, lote, motivo…"
            aria-label="Buscar en la bitácora"
            autoComplete="off"
          />
          {text && (
            <button type="button" aria-label="Borrar búsqueda" onClick={() => setText('')}>
              <X size={16} />
            </button>
          )}
        </label>

        <div className={a.selects}>
          <label className={a.select}>
            <span>Quién lo hizo</span>
            <select value={actorId} onChange={(e) => update({ persona: e.target.value })}>
              <option value="">Todas las personas</option>
              {actors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`${a.select} ${m.dates}`}>
            <span>Fechas</span>
            <span className={m.dateRow}>
              <input type="date" aria-label="Desde" value={from} max={to || undefined} onChange={(e) => update({ desde: e.target.value })} />
              <span aria-hidden="true">al</span>
              <input type="date" aria-label="Hasta" value={to} min={from || undefined} onChange={(e) => update({ hasta: e.target.value })} />
            </span>
          </label>
        </div>

        <div className={n.chipRows}>
          <div className={a.chips} role="radiogroup" aria-label="Tipo de acción">
            {[{ id: '' as const, label: 'Todo' }, ...AUDIT_CATEGORIES].map((c) => (
              <button
                key={c.id || 'all'}
                type="button"
                role="radio"
                aria-checked={category === c.id}
                className={`${a.chip} ${category === c.id ? a.chipOn : ''}`}
                onClick={() => update({ categoria: c.id })}
              >
                {c.label}
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
          {loading ? <Skeleton w={150} h={18} /> : `${data?.total ?? 0} ${data?.total === 1 ? 'evento' : 'eventos'}`}
        </h2>

        {!loading && !error && data && data.total === 0 && (
          <p className={s.hint}>{hasFilters ? 'Ningún evento coincide con esa búsqueda o filtros.' : 'Todavía no hay eventos en la bitácora.'}</p>
        )}

        {(loading || (data && data.total > 0)) && (
          <div className={d.tableWrap}>
            <table className={`${d.table} ${a.table}`}>
              <thead>
                <tr>
                  <th className={a.wide}>Cuándo</th>
                  <th>Quién</th>
                  <th>Qué hizo</th>
                  <th className={a.wide}>Sobre</th>
                  <th className={d.act}>
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading || !data ? (
                  <SkeletonRows
                    classNames={COL_CLASSES}
                    cols={['70%', '60%', '80%', '60%', 50]}
                    rows={data && data.total > 0 ? Math.min(pageSize, Math.max(data.total - page * pageSize, 1)) : pageSize}
                  />
                ) : (
                  data.rows.map((r) => <AuditRow key={r.id} row={r} onOpen={() => setDetail(r)} />)
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <Pagination
            label="eventos"
            page={page + 1}
            pageSize={pageSize}
            total={data.total}
            disabled={loading}
            onPageChange={(p) => update({ pagina: String(p) }, true)}
            onPageSizeChange={(x) => update({ porPagina: x === 10 ? '' : String(x) })}
          />
        )}
      </section>

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} />}
    </AdminShell>
  );
}

function AuditRow({ row, onOpen }: { row: AdminAuditRow; onOpen: () => void }) {
  const link = auditEntityLink(row);
  const name = auditTarget(row);
  const sum = auditSummary(row);
  return (
    <tr>
      <td className={`${a.wide} ${a.date}`}>{shortDate(row.createdAt)}</td>
      <td>
        <span className={n.who}>{row.actorName ?? 'Cuenta eliminada'}</span>
        <span className={`${n.whoSub} ${m.mobileOnly}`}>{name}</span>
      </td>
      <td>
        <span className={m.action}>{sum.title}</span>
        {sum.detail && <span className={`${n.whoSub} ${m.detail}`}>{sum.detail}</span>}
        <span className={`${n.whoSub} ${m.cat}`}>{categoryLabel(row.action)}</span>
      </td>
      <td className={a.wide}>
        {link ? (
          <Link to={link} className={n.who}>
            {name}
          </Link>
        ) : (
          <span className={m.plain}>{name}</span>
        )}
      </td>
      <td className={d.act}>
        <Button size="sm" variant="outline" onClick={onOpen} aria-label={`Ver detalle: ${sum.title}`}>
          Ver
        </Button>
      </td>
    </tr>
  );
}

function categoryLabel(action: string) {
  const c = auditCategory(action);
  return AUDIT_CATEGORIES.find((x) => x.id === c)?.label ?? 'Otros';
}

function DetailModal({ row, onClose }: { row: AdminAuditRow; onClose: () => void }) {
  const details = auditDetails(row);
  const link = auditEntityLink(row);
  const name = auditTarget(row);
  return (
    <AdminModal title={auditLabel(row.action)} onClose={onClose}>
      <p className={m.headline}>{auditSummary(row).title}</p>
      <dl className={m.dl}>
        <div>
          <dt>Cuándo</dt>
          <dd>{new Date(row.createdAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}</dd>
        </div>
        <div>
          <dt>Quién</dt>
          <dd>{row.actorName ?? 'Cuenta eliminada'}</dd>
        </div>
        <div>
          <dt>Sobre</dt>
          <dd>
            {link ? <Link to={link}>{name}</Link> : name}
            <span className={m.type}> · {auditEntityType(row.entityType)}</span>
          </dd>
        </div>
        {details.map((x) => (
          <div key={x.label}>
            <dt>{x.label}</dt>
            <dd>{x.value}</dd>
          </div>
        ))}
      </dl>
      <div className={m.footer}>
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </AdminModal>
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

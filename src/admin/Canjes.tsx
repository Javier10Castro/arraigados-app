import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import { api } from '../lib/api';
import { DRINK_LABEL } from '../data/app';
import {
  parsePageSize,
  type AdminRedemptionRow,
  type AdminRedemptionsCatalog,
  type AdminRedemptionsResponse,
  type RedemptionStatus,
} from '../../shared/api';
import Pagination from '../components/Pagination';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';
import u from './Usuarios.module.css';
import c from './Canjes.module.css';

/**
 * Admin -> Canjes (Etapa 6, parte Admin): los canjes de aguas frescas que ha
 * hecho Staff, con filtros, paginación e historial -- y la anulación de un
 * canje (motivo obligatorio, nunca se borra el registro).
 *
 * Mismo esqueleto que Asistentes.tsx: filtros en la URL, paginación en el
 * SERVIDOR (puede crecer mucho), estados loading/empty/error con esqueleto.
 * Ver docs/CLAUDE_HANDOFF.md §39.
 */

const COL_CLASSES = [a.wide, undefined, a.wide, d.kitCol, undefined, a.wide, undefined, d.act];

const STATUS_FILTERS: { value: RedemptionStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'VALIDO', label: 'Válidos' },
  { value: 'ANULADO', label: 'Anulados' },
];

export default function Canjes() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const manualCode = params.get('pulsera') ?? '';
  const status = (params.get('estado') ?? '') as RedemptionStatus | '';
  const staffId = params.get('staff') ?? '';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1);
  const pageSize = parsePageSize(params.get('porPagina'));

  const [text, setText] = useState(q);
  const [codeText, setCodeText] = useState(manualCode);
  const [catalog, setCatalog] = useState<AdminRedemptionsCatalog | null>(null);
  const [data, setData] = useState<AdminRedemptionsResponse | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState<AdminRedemptionRow | null>(null);
  const seq = useRef(0);

  const update = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!keepPage) next.delete('pagina');
    setParams(next, { replace: true });
  };

  // Búsqueda por nombre y por pulsera, con una pequeña espera (igual que Asistentes).
  useEffect(() => {
    if (text.trim() === q) return;
    const t = window.setTimeout(() => update({ q: text.trim() }), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  useEffect(() => {
    if (codeText.trim() === manualCode) return;
    const t = window.setTimeout(() => update({ pulsera: codeText.trim() }), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeText]);

  useEffect(() => {
    api.redemptionsCatalog().then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    const req = ++seq.current;
    setError('');
    setLoading(true);
    api
      .adminRedemptions({ q, manualCode, status, staffId, from, to, page, pageSize })
      .then((r) => {
        if (req !== seq.current) return;
        setData(r);
        if (r.total > 0 && r.page !== page) update({ pagina: String(r.page + 1) }, true);
      })
      .catch((err: Error) => req === seq.current && setError(err.message))
      .finally(() => req === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, manualCode, status, staffId, from, to, page, pageSize, reload]);

  const hasFilters = Boolean(q || manualCode || status || staffId || from || to);

  return (
    <AdminShell title="Canjes">
      <section className={`${d.card} ${a.filters}`} aria-label="Buscar y filtrar canjes">
        <label className={a.search}>
          <Search size={17} aria-hidden="true" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar por nombre del asistente…"
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
          <label className={a.select}>
            <span>Pulsera</span>
            <input
              value={codeText}
              onChange={(e) => setCodeText(e.target.value)}
              placeholder="AR26-… o QR"
              autoComplete="off"
              className={c.codeInput}
            />
          </label>
          <Select label="Staff" value={staffId} options={catalog?.staff ?? []} onChange={(v) => update({ staff: v })} />
          <label className={c.dates}>
            <span>Del</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => update({ desde: e.target.value })} />
            <span>al</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => update({ hasta: e.target.value })} />
          </label>
        </div>

        <div className={a.chips} role="radiogroup" aria-label="Estado del canje">
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
          {hasFilters && (
            <button
              type="button"
              className={a.clear}
              onClick={() => {
                setText('');
                setCodeText('');
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
          {loading ? <Skeleton w={150} h={18} /> : `${data?.total ?? 0} ${data?.total === 1 ? 'canje' : 'canjes'}`}
        </h2>

        {!loading && !error && data && data.total === 0 && (
          <p className={s.hint}>{hasFilters ? 'Ningún canje coincide con esa búsqueda o filtros.' : 'Todavía no se ha hecho ningún canje.'}</p>
        )}

        {(loading || (data && data.total > 0)) && (
          <div className={d.tableWrap}>
            <table className={`${d.table} ${a.table}`}>
              <thead>
                <tr>
                  <th className={a.wide}>Fecha</th>
                  <th>Asistente</th>
                  <th className={a.wide}>Pulsera</th>
                  <th className={d.kitCol}>Paquete</th>
                  <th>{DRINK_LABEL}</th>
                  <th className={a.wide}>Staff</th>
                  <th>Estado</th>
                  <th className={d.act}>
                    <span className={d.srOnly}>Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading || !data ? (
                  <SkeletonRows
                    classNames={COL_CLASSES}
                    cols={['70%', '75%', '60%', 52, 30, '60%', 60, 70]}
                    rows={data && data.total > 0 ? Math.min(pageSize, Math.max(data.total - page * pageSize, 1)) : pageSize}
                  />
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className={a.wide}>{shortDate(r.createdAt)}</td>
                      <td>
                        <span className={a.name}>{r.attendeeName}</span>
                      </td>
                      <td className={a.wide}>{r.pulseLabel}</td>
                      <td className={d.kitCol}>
                        <span className={d.kit}>{r.packageName}</span>
                      </td>
                      <td>{r.quantity}</td>
                      <td className={a.wide}>{r.staffName}</td>
                      <td>
                        {r.status === 'VALIDO' ? (
                          <span className={c.statusValid}>Válido</span>
                        ) : (
                          <span className={c.statusVoid}>
                            Anulado
                            {r.voidedAt && (
                              <span className={c.voidMeta}>
                                {shortDate(r.voidedAt)} · {r.voidedByName}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className={d.act}>
                        {r.status === 'VALIDO' && (
                          <Button size="sm" variant="outline" className={c.voidBtn} onClick={() => setVoiding(r)}>
                            Anular
                          </Button>
                        )}
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
            label="canjes"
            page={page + 1}
            pageSize={pageSize}
            total={data.total}
            disabled={loading}
            onPageChange={(p) => update({ pagina: String(p) }, true)}
            onPageSizeChange={(n) => update({ porPagina: n === 10 ? '' : String(n) })}
          />
        )}
      </section>

      {voiding && (
        <VoidModal
          row={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </AdminShell>
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

const REASON_MAX = 500;

/**
 * Modal de anulación (punto 10 del encargo): el motivo es obligatorio, no
 * puede estar vacío ni ser solo espacios. El backend (server/redemptions.ts)
 * es quien de verdad impone esto y hace la operación transaccional; aquí
 * solo se evita mandar la petición si ya se sabe que va a fallar.
 */
function VoidModal({ row, onClose, onDone }: { row: AdminRedemptionRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= REASON_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError('Escribe el motivo de la anulación.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.voidRedemption(row.id, { reason: trimmed });
      if (res.outcome === 'already_voided') {
        setError('Este canje ya había sido anulado (quizá en otra pestaña).');
        setBusy(false);
        return;
      }
      if (res.outcome === 'not_found') {
        setError('Este canje ya no existe.');
        setBusy(false);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular el canje. Intenta de nuevo.');
      setBusy(false);
    }
  }

  return (
    <AdminModal title="Anular canje" onClose={onClose} busy={busy}>
      <form className={u.form} onSubmit={submit} noValidate>
        <p className={c.summary}>
          <b>{row.attendeeName}</b> · {row.pulseLabel} · {row.packageName} · {row.quantity} {DRINK_LABEL} · {shortDate(row.createdAt)}
        </p>
        <p className={u.hint}>
          El canje queda marcado como <b>Anulado</b> (nunca se borra) y el beneficio se devuelve a la pulsera activa del asistente.
        </p>

        <div className={c.reasonBox}>
          <label className={u.f}>
            <span>Motivo de la anulación</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Error de Staff: se canjeó por equivocación."
              maxLength={REASON_MAX}
              autoFocus
            />
          </label>
          <p className={c.reasonCount}>{reason.length}/{REASON_MAX}</p>
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
            {busy ? 'Anulando…' : 'Anular canje'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

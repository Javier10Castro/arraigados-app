import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, ChevronLeft, CircleDashed, Copy, Download, FileText, Search, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import { api, batchFileUrls, downloadFile } from '../lib/api';
import {
  PAPER_SIZE_LABELS,
  PAPER_SIZES,
  parsePageSize,
  type AdminBatchDetail,
  type PaperSize,
  type PulseStatus,
} from '../../shared/api';
import Pagination from '../components/Pagination';
import { Skeleton, SkeletonRegion, SkeletonRows } from '../components/Skeleton';
import UserAvatar from '../components/UserAvatar';
import { BATCH_STATUS_LABEL, PULSE_STATUS_LABEL, money, shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';

/**
 * Admin → Lotes → un lote (`/admin/lotes/:id`). Página propia (antes era un
 * modal) con el mismo lenguaje visual del panel:
 * - datos del lote y conteos,
 * - imprimir: PDF en A4 / Carta / 11×17,
 * - tabla de pulseras: # · Kit · Estado · Código · Copiar enlace · Descargar QR.
 *
 * Las descargas pasan por downloadFile(): si el servidor responde con error se
 * muestra el mensaje en lugar de guardar un .json.
 *
 * Tabla de pulseras: paginada EN EL SERVIDOR (un lote puede tener 500; nunca
 * se traen ni se dibujan todas). Búsqueda y filtro de estado también en el
 * servidor, sobre todo el lote. Estado en la URL:
 * ?q=&estado=&pagina=&porPagina= (pagina 1-based; 10 por página por defecto).
 * Cambiar búsqueda, estado o tamaño regresa a la página 1. No hay "Ver todos"
 * a propósito (handoff §37).
 */

/** Clase de cada columna de la tabla (las mismas para el esqueleto). */
const PULSE_COL_CLASSES = [d.num, d.kitCol, undefined, undefined, d.codeCol, d.act, d.act];

const STATUS_FILTERS: { value: PulseStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'UNCLAIMED', label: 'Sin reclamar' },
  { value: 'ACTIVE', label: 'Reclamadas' },
  { value: 'INVALIDATED', label: 'Deshabilitadas' },
];

/** Ícono de cada estado de pulsera (además del color y el texto). */
const STATUS_ICON: Record<PulseStatus, LucideIcon> = {
  UNCLAIMED: CircleDashed,
  ACTIVE: CheckCircle2,
  INVALIDATED: XCircle,
};

export default function LoteDetalle() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('pagina') ?? 1)) || 1);
  const pageSize = parsePageSize(params.get('porPagina'));
  const q = params.get('q') ?? '';
  const rawStatus = params.get('estado') ?? '';
  const status = (STATUS_FILTERS.some((f) => f.value === rawStatus) ? rawStatus : '') as PulseStatus | '';

  const [lote, setLote] = useState<AdminBatchDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState(q);
  const seq = useRef(0);
  const [paper, setPaper] = useState<PaperSize>('letter');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [downloading, setDownloading] = useState('');

  /** Cambia filtros en la URL. Todo cambio que no sea de página regresa a la página 1. */
  const update = useCallback(
    (changes: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
          if (!('pagina' in changes)) next.delete('pagina');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Búsqueda con pausa (no consulta en cada tecla).
  useEffect(() => {
    if (text.trim() === q) return;
    const t = window.setTimeout(() => update({ q: text.trim() }), 300);
    return () => window.clearTimeout(t);
  }, [text, q, update]);

  const load = useCallback(() => {
    const req = ++seq.current;
    setLoadError('');
    setLoading(true);
    api
      .adminBatch(id, { page: page - 1, pageSize, q, status })
      .then((r) => {
        if (req !== seq.current) return; // respuesta vieja: se ignora
        setLote(r);
        // El servidor ajustó una página fuera de rango: la URL lo refleja.
        if (r.filteredTotal > 0 && r.page + 1 !== page) update({ pagina: String(r.page + 1) });
      })
      .catch((err: Error) => req === seq.current && setLoadError(err.message))
      .finally(() => req === seq.current && setLoading(false));
  }, [id, page, pageSize, q, status, update]);
  useEffect(load, [load]);

  const pulses = lote?.pulses ?? [];
  const filtered = Boolean(q || status);

  const sampleUrl = lote?.qrBase ?? '';
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(sampleUrl);

  const downloadPdf = async () => {
    if (!lote) return;
    setPdfBusy(true);
    setNotice('');
    try {
      await downloadFile(batchFileUrls.pdf(lote.id, paper), 'application/pdf', `pulseras-${lote.code}-${paper}.pdf`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo generar el PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadQr = async (pulseId: string, qrToken: string) => {
    if (!lote) return;
    setDownloading(pulseId);
    setNotice('');
    try {
      await downloadFile(batchFileUrls.qr(lote.id, pulseId), 'image/png', `pulsera-${qrToken}.png`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo descargar el QR.');
    } finally {
      setDownloading('');
    }
  };

  const copy = async (pulseId: string, url: string) => {
    setNotice('');
    if (!url) {
      setNotice('No hay dominio configurado para armar el enlace (PUBLIC_BASE_URL).');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(pulseId);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setNotice(`No se pudo copiar automáticamente. El enlace es: ${url}`);
    }
  };

  return (
    <AdminShell title={lote?.code ?? 'Lote'}>
      <Link to="/admin/lotes" className={d.back}>
        <ChevronLeft size={16} strokeWidth={2.4} /> Lotes
      </Link>

      {loadError && (
        <div className={s.notice} role="alert">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {!lote && !loadError && <LoteSkeleton />}

      {lote && (
        <>
          <section className={d.card}>
            <dl className={d.facts}>
              <div>
                <dt>Kit</dt>
                <dd>
                  {lote.packageName} · {money(lote.packagePrice)}
                </dd>
              </div>
              <div>
                <dt>Pulseras</dt>
                <dd>{lote.total}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd className={s['st_' + lote.status.toLowerCase()]}>{BATCH_STATUS_LABEL[lote.status]}</dd>
              </div>
              <div>
                <dt>Creado</dt>
                <dd>
                  {shortDate(lote.createdAt)} · {lote.createdBy}
                </dd>
              </div>
            </dl>
            <div className={d.progress} aria-label={`${lote.active} de ${lote.total} pulseras reclamadas`}>
              <div className={d.progressBar}>
                <span style={{ width: `${lote.total ? (lote.active / lote.total) * 100 : 0}%` }} />
              </div>
              <span className={d.progressText}>
                <strong>{lote.total ? Math.round((lote.active / lote.total) * 100) : 0}%</strong> reclamadas
              </span>
            </div>
            <div className={s.tally}>
              <span className={s.pillFree}>{lote.unclaimed} sin reclamar</span>
              <span className={s.pillActive}>
                {lote.active} {lote.active === 1 ? 'reclamada' : 'reclamadas'}
              </span>
              {lote.invalidated > 0 && (
                <span className={s.pillDead}>
                  {lote.invalidated} {lote.invalidated === 1 ? 'deshabilitada' : 'deshabilitadas'}
                </span>
              )}
            </div>
          </section>

          <section className={d.card}>
            <h2 className={d.cardTitle}>Imprimir</h2>
            {isLocalhost && (
              <p className={s.error} role="note">
                Estos QR apuntan a <strong>{new URL(sampleUrl).host}</strong>: solo sirven para pruebas, no los imprimas
                para el congreso.
              </p>
            )}
            <p className={s.hint}>
              Tarjetas de 50 × 35 mm. Imprime a <strong>tamaño real / 100%</strong>; la línea de 5 cm al pie de cada hoja
              sirve para comprobarlo.
            </p>
            <div className={s.papers} role="radiogroup" aria-label="Tamaño de papel">
              {PAPER_SIZES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={paper === p}
                  className={paper === p ? s.paperOn : undefined}
                  onClick={() => setPaper(p)}
                >
                  {PAPER_SIZE_LABELS[p]}
                </button>
              ))}
            </div>
            <button type="button" className={s.download} onClick={() => void downloadPdf()} disabled={pdfBusy}>
              <FileText size={16} /> {pdfBusy ? 'Generando PDF…' : 'Descargar PDF'}
            </button>
          </section>

          {notice && (
            <p className={d.alert} role="alert">
              {notice}
            </p>
          )}

          <section className={d.card} aria-busy={loading}>
            <h2 className={d.cardTitle}>Pulseras ({lote.total})</h2>

            {lote.total > 0 && (
              <div className={`${a.filters} ${d.pulseFilters}`}>
                <label className={a.search}>
                  <Search size={17} aria-hidden="true" />
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Buscar token, código, nombre o número…"
                    aria-label="Buscar pulsera"
                    autoComplete="off"
                  />
                  {text && (
                    <button type="button" aria-label="Borrar búsqueda" onClick={() => setText('')}>
                      <X size={16} />
                    </button>
                  )}
                </label>
                <div className={a.chips} role="radiogroup" aria-label="Estado de la pulsera">
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
              </div>
            )}

            {lote.total === 0 ? (
              <p className={s.hint}>Este lote no tiene pulseras.</p>
            ) : !loading && lote.filteredTotal === 0 ? (
              <p className={s.hint}>{filtered ? 'Ninguna pulsera coincide con la búsqueda o el filtro.' : 'Este lote no tiene pulseras.'}</p>
            ) : (
              <div className={d.tableWrap}>
                <table className={d.table}>
                  <thead>
                    <tr>
                      <th className={d.num}>#</th>
                      <th className={d.kitCol}>Kit</th>
                      <th>Estado</th>
                      <th>Usuario</th>
                      <th className={d.codeCol}>Código</th>
                      <th className={d.act}>
                        <span className={d.srOnly}>Copiar enlace</span>
                      </th>
                      <th className={d.act}>
                        <span className={d.srOnly}>Descargar pulsera</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <SkeletonRows classNames={PULSE_COL_CLASSES} cols={[18, 52, 92, '70%', '80%', 30, 30]} rows={Math.min(pageSize, Math.max(lote.filteredTotal - (page - 1) * pageSize, 1))} />
                    ) : (
                      pulses.map((p) => (
                        <tr key={p.id}>
                          <td className={d.num}>{p.position}</td>
                          <td className={d.kitCol}>
                            <span className={d.kit}>{p.packageName}</span>
                          </td>
                          <td>
                            <StatusChip status={p.status} />
                          </td>
                          <td>
                            {p.attendeeName && p.status === 'INVALIDATED' ? (
                              <span className={d.replaced} title="Esta pulsera se reemplazó por otra">
                                {p.attendeeName} · reemplazada
                              </span>
                            ) : p.attendeeName ? (
                              <span className={d.user}>
                                <UserAvatar className={d.avatar} attendeeId={p.attendeeId} name={p.attendeeName} />
                                <span className={d.userName}>{p.attendeeName}</span>
                              </span>
                            ) : (
                              <span className={d.noUser}>Sin asignar</span>
                            )}
                          </td>
                          <td className={`${d.codeCol} ${d.code}`}>{p.qrToken}</td>
                          <td className={d.act}>
                            <button
                              type="button"
                              className={s.iconBtn}
                              title="Copiar enlace del QR"
                              aria-label={`Copiar enlace de la pulsera ${p.position}`}
                              onClick={() => void copy(p.id, p.qrUrl)}
                            >
                              {copied === p.id ? <Check size={15} /> : <Copy size={15} />}
                            </button>
                          </td>
                          <td className={d.act}>
                            <button
                              type="button"
                              className={`${s.iconBtn} ${p.status === 'INVALIDATED' ? d.blocked : ''}`}
                              title={
                                p.status === 'INVALIDATED'
                                  ? 'Pulsera deshabilitada: no se puede descargar'
                                  : 'Descargar pulsera con su QR (PNG)'
                              }
                              aria-label={`Descargar pulsera ${p.position}`}
                              disabled={downloading === p.id || p.status === 'INVALIDATED'}
                              onClick={() => void downloadQr(p.id, p.qrToken)}
                            >
                              <Download size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              label="pulseras"
              page={page}
              pageSize={pageSize}
              total={lote.filteredTotal}
              disabled={loading}
              onPageChange={(p) => update({ pagina: String(p) })}
              onPageSizeChange={(n) => update({ porPagina: n === 10 ? '' : String(n) })}
            />
          </section>
        </>
      )}
    </AdminShell>
  );
}

function StatusChip({ status }: { status: PulseStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`${d.status} ${d['ps_' + status.toLowerCase()]}`}>
      <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
      {PULSE_STATUS_LABEL[status]}
    </span>
  );
}

/** Carga inicial del lote: mismas tarjetas que la página real, en esqueleto. */
function LoteSkeleton() {
  return (
    <SkeletonRegion label="Cargando lote…" className={d.skeletonStack}>
      <section className={d.card}>
        <div className={d.facts}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton w="40%" h={10} />
              <Skeleton w="75%" h={14} style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
        <Skeleton h={10} r={5} />
      </section>
      <section className={d.card}>
        <Skeleton w={110} h={16} />
        <Skeleton h={44} r={12} />
      </section>
      <section className={d.card}>
        <Skeleton w={150} h={16} />
        <table className={d.table}>
          <thead>
            <tr>
              <th className={d.num}>#</th>
              <th className={d.kitCol}>Kit</th>
              <th>Estado</th>
              <th>Usuario</th>
              <th className={d.codeCol}>Código</th>
              <th className={d.act} />
              <th className={d.act} />
            </tr>
          </thead>
          <tbody>
            <SkeletonRows classNames={PULSE_COL_CLASSES} cols={[18, 52, 92, '70%', '80%', 30, 30]} rows={10} />
          </tbody>
        </table>
      </section>
    </SkeletonRegion>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Pagination from '../components/Pagination';
import { ListSkeleton } from '../components/Skeleton';
import { usePagedList } from '../lib/usePagedList';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Wand2 } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import { api } from '../lib/api';
import { MAX_BATCH_PULSES, type AdminBatchesResponse, type PackageSummary } from '../../shared/api';
import { BATCH_STATUS_LABEL, money, shortDate } from './format';
import s from './Lotes.module.css';

/**
 * Admin → Lotes (Etapa 3): lista de lotes y alta.
 *
 * Crear lote (nombre + kit + 1..500 pulseras) → abre la página del lote
 * (`/admin/lotes/:id`, LoteDetalle.tsx) con la tabla de pulseras y el PDF.
 *
 * Lo que la pantalla NO hace, a propósito: cerrar lotes ("Batch"."status"
 * nace en ABIERTO; CERRADO/CANCELADO están reservados), reasignar ni anular.
 */

/* ================================================================== */
/* Listado                                                             */
/* ================================================================== */

export default function Lotes() {
  const [data, setData] = useState<AdminBatchesResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoadError('');
    api
      .adminBatches()
      .then(setData)
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(load, [load]);

  const batches = data?.batches ?? [];
  // Lista completa del servidor (decenas de lotes como mucho) → página de 10 en el navegador.
  const paged = usePagedList(batches);

  return (
    <AdminShell
      title="Lotes"
      action={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={15} strokeWidth={2.6} /> Crear lote
        </Button>
      }
    >
      {loadError && (
        <div className={s.notice} role="alert">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {!data && !loadError && <ListSkeleton rows={5} avatar={false} rowClassName={s.row} label="Cargando lotes…" />}
      {data && batches.length === 0 && (
        <div className={s.empty}>
          <p className={s.muted}>Todavía no hay lotes.</p>
          <p className={s.hint}>
            Un lote es un grupo de hasta {MAX_BATCH_PULSES} pulseras del mismo kit. Al crearlo se generan los QR y
            quedan guardados en Neon; luego descargas el PDF para imprimir.
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus size={15} strokeWidth={2.6} /> Crear el primer lote
          </Button>
        </div>
      )}

      {batches.length > 0 && (
        <ul className={s.list}>
          {paged.pageItems.map((b) => (
            <li key={b.id}>
              <button type="button" className={s.row} onClick={() => navigate(`/admin/lotes/${b.id}`)}>
                <span className={s.body}>
                  <strong>{b.code}</strong>
                  <span>
                    {b.packageName} · {money(b.packagePrice)} · {b.total} pulseras
                  </span>
                  <span className={s.sub}>
                    {shortDate(b.createdAt)} · {b.createdBy}
                  </span>
                </span>
                <span className={s.counts}>
                  <span className={s.pillFree}>{b.unclaimed} sin reclamar</span>
                  <span className={s.pillActive}>
                    {b.active} {b.active === 1 ? 'activa' : 'activas'}
                  </span>
                </span>
                <span className={`${s.state} ${s['st_' + b.status.toLowerCase()]}`}>{BATCH_STATUS_LABEL[b.status]}</span>
                <ChevronRight className={s.chev} size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {batches.length > 0 && (
        <div className={s.pagerCard}>
          <Pagination
            label="lotes"
            page={paged.page}
            pageSize={paged.pageSize}
            total={paged.total}
            onPageChange={paged.setPage}
            onPageSizeChange={paged.setPageSize}
          />
        </div>
      )}

      {creating && (
        <CreateBatchModal
          packages={data?.packages ?? []}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/admin/lotes/${id}`)}
        />
      )}
    </AdminShell>
  );
}

/* ================================================================== */
/* Alta                                                                */
/* ================================================================== */

function CreateBatchModal({
  packages,
  onClose,
  onCreated,
}: {
  packages: (PackageSummary & { id: string; active: boolean })[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [code, setCode] = useState('');
  const [packageId, setPackageId] = useState('');
  const [quantity, setQuantity] = useState('50');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!packageId && packages.length) setPackageId(packages[0].id);
  }, [packages, packageId]);

  const qty = Number(quantity.trim());
  const qtyOk = Number.isInteger(qty) && qty >= 1 && qty <= MAX_BATCH_PULSES;
  const suggest = async () => {
    setSuggesting(true);
    setError('');
    try {
      const { code: next } = await api.nextBatchCode();
      setCode(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo sugerir un nombre.');
    } finally {
      setSuggesting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('creando');
    setError('');
    try {
      const created = await api.createBatch({ code: code.trim(), packageId, quantity: qty });
      onClose();
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el lote.');
      setBusy('');
    }
  };

  return (
    <AdminModal title="Crear lote" onClose={onClose} busy={Boolean(busy)}>
      <form className={s.form} onSubmit={submit} noValidate>
        <label className={s.f}>
          <span>Nombre del lote</span>
          <div className={s.genRow}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="LOTE-2026-001"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className={s.gen} onClick={() => void suggest()} disabled={suggesting}>
              <Wand2 size={15} /> Sugerir
            </button>
          </div>
          <small className={s.small}>Hasta 40 caracteres. Escribe el que quieras; el botón sugiere el siguiente libre.</small>
        </label>

        <div className={s.f}>
          <span>Kit</span>
          <div className={s.pkgs} role="radiogroup" aria-label="Kit">
            {packages.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={packageId === p.id}
                className={packageId === p.id ? s.pkgOn : undefined}
                onClick={() => setPackageId(p.id)}
              >
                <strong>{p.name}</strong>
                <span>
                  {money(p.price)} · {p.includedDrinks} {p.includedDrinks === 1 ? 'agua' : 'aguas'}
                </span>
              </button>
            ))}
          </div>
          <small className={s.small}>Todas las pulseras del lote llevan este kit. No se puede cambiar después.</small>
        </div>

        <label className={s.f}>
          <span>Cantidad de pulseras</span>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="50"
            className={s.mono}
          />
          <small className={`${s.small} ${qty && !qtyOk ? s.badSmall : ''}`}>
            {qty && !qtyOk
              ? `Debe ser un número entero entre 1 y ${MAX_BATCH_PULSES}.`
              : `Entre 1 y ${MAX_BATCH_PULSES}. Si necesitas más, crea varios lotes.`}
          </small>
        </label>

        <p className={s.hint}>
          Se generará un QR único por pulsera y todo se guardará en un solo paso: si algo falla, no queda un lote a medias.
        </p>

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        <div className={s.actions}>
          <Button variant="outline" onClick={onClose} disabled={Boolean(busy)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={Boolean(busy) || !code.trim() || !packageId || !qtyOk}>
            {busy ? 'Generando…' : `Generar ${qtyOk ? qty : ''} pulseras`}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

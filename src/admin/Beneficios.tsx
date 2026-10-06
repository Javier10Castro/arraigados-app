import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import { ListSkeleton } from '../components/Skeleton';
import { api } from '../lib/api';
import { DRINK_LABEL, formatPrice } from '../data/app';
import type { AdminBenefitsResponse, AdminKitBenefits } from '../../shared/api';
import s from './Usuarios.module.css';
import b from './Beneficios.module.css';

/**
 * Admin → Beneficios: lo que incluye cada kit ("Incluye" en /beneficios y en el Home del asistente).
 * Tabla "PackageBenefit" (migración 008). Se puede agregar, renombrar, quitar y reordenar.
 * Las aguas frescas NO se editan aquí: son del kit (Package.includedDrinks) y se muestran solo para referencia.
 */
export default function BeneficiosAdmin() {
  const [data, setData] = useState<AdminBenefitsResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [kitId, setKitId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(() => {
    setLoadError('');
    api
      .adminBenefits()
      .then((d) => {
        setData(d);
        setKitId((cur) => (cur && d.kits.some((k) => k.id === cur) ? cur : (d.kits[0]?.id ?? null)));
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(load, [load]);

  const kit: AdminKitBenefits | undefined = data?.kits.find((k) => k.id === kitId);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!kit || !text.trim()) return;
    if (await run(() => api.createBenefit(kit.id, text))) setText('');
  };

  return (
    <AdminShell title="Beneficios">
      {loadError && (
        <div className={s.notice} role="alert">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {!data && !loadError && <ListSkeleton rows={4} rowClassName={b.row} label="Cargando beneficios…" />}

      {data && !data.ready && (
        <p className={b.errorBox} role="alert">
          Falta aplicar la migración 008 en la base: corre <strong>npm run db:migrar</strong>. Mientras tanto la app muestra la lista fija de siempre.
        </p>
      )}

      {data && (
        <>
          <div className={s.chips} role="tablist" aria-label="Kit">
            {data.kits.map((k) => (
              <button
                key={k.id}
                type="button"
                role="tab"
                aria-selected={kitId === k.id}
                className={`${s.chip} ${kitId === k.id ? s.chipOn : ''}`}
                onClick={() => {
                  setKitId(k.id);
                  setError('');
                  setText('');
                }}
              >
                {k.name} <span className={s.count}>{k.benefits.length}</span>
              </button>
            ))}
          </div>

          {kit && (
            <>
              <section className={b.kitCard}>
                <span className={b.kitName}>{kit.name}</span>
                <strong className={b.kitPrice}>{formatPrice(kit.price)}</strong>
                <p className={b.kitMeta}>
                  {kit.includedDrinks > 0 ? `Además incluye ${kit.includedDrinks} ${DRINK_LABEL}` : `No incluye ${DRINK_LABEL}`} (se administra con el kit, no aquí).
                </p>
              </section>

              {kit.benefits.length === 0 && <p className={s.muted}>Este kit no tiene beneficios. Agrega el primero abajo.</p>}
              <ul className={b.list}>
                {kit.benefits.map((it, i) => (
                  <li key={it.id} className={b.row}>
                    <span className={b.label}>{it.label}</span>
                    <span className={b.tools}>
                      <button type="button" className={b.iconBtn} aria-label={`Subir ${it.label}`} disabled={busy || i === 0} onClick={() => void run(() => api.moveBenefit(it.id, -1))}>
                        <ChevronUp size={18} />
                      </button>
                      <button
                        type="button"
                        className={b.iconBtn}
                        aria-label={`Bajar ${it.label}`}
                        disabled={busy || i === kit.benefits.length - 1}
                        onClick={() => void run(() => api.moveBenefit(it.id, 1))}
                      >
                        <ChevronDown size={18} />
                      </button>
                      <button type="button" className={b.iconBtn} aria-label={`Editar ${it.label}`} disabled={busy} onClick={() => setEditing(it)}>
                        <Pencil size={16} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>

              <form className={b.add} onSubmit={add}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={data.labelMax}
                  placeholder="Nuevo beneficio, ej. Gorra oficial"
                  aria-label="Nuevo beneficio"
                  autoComplete="off"
                  disabled={!data.ready}
                />
                <Button type="submit" size="sm" disabled={busy || !text.trim() || !data.ready || kit.benefits.length >= data.perKitMax}>
                  <Plus size={15} strokeWidth={2.6} /> Agregar
                </Button>
              </form>
              {error && (
                <p className={b.errorBox} role="alert">
                  {error}
                </p>
              )}
              <p className={b.hint}>El orden de esta lista es el que ve el asistente en “Incluye”. Los cambios se ven al abrir de nuevo su pantalla.</p>
            </>
          )}
        </>
      )}

      {editing && <EditModal item={editing} labelMax={data?.labelMax ?? 80} onClose={() => setEditing(null)} onChanged={load} />}
    </AdminShell>
  );
}

function EditModal({ item, labelMax, onClose, onChanged }: { item: { id: string; label: string }; labelMax: number; onClose: () => void; onChanged: () => void }) {
  const [label, setLabel] = useState(item.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModal title="Editar beneficio" onClose={onClose} busy={busy}>
      <form
        className={s.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && label.trim() && label.trim() !== item.label) void run(() => api.updateBenefit(item.id, label));
        }}
      >
        <label className={s.f}>
          <span>Beneficio</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={labelMax} autoComplete="off" />
        </label>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={b.actions}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !label.trim() || label.trim() === item.label}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>

      <section className={s.section}>
        <h3 className="label">Quitar del kit</h3>
        {confirm ? (
          <>
            <p className={s.hint}>¿Quitar “{item.label}”? Dejará de aparecer en “Incluye” de los asistentes de este kit.</p>
            <div className={b.actions}>
              <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>
                No, conservar
              </Button>
              <Button variant="outline" className={s.dangerBtn} disabled={busy} onClick={() => void run(() => api.deleteBenefit(item.id))}>
                {busy ? 'Quitando…' : 'Sí, quitar'}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="outline" className={s.dangerBtn} disabled={busy} onClick={() => setConfirm(true)}>
            Quitar beneficio
          </Button>
        )}
      </section>
    </AdminModal>
  );
}

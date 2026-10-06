import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Lock, Plus, Search } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import Pagination from '../components/Pagination';
import { ListSkeleton } from '../components/Skeleton';
import { usePagedList } from '../lib/usePagedList';
import { api } from '../lib/api';
import type { AdminChurchRow, AdminChurchesResponse, AdminPresbyteryOption } from '../../shared/api';
import s from './Usuarios.module.css';
import i from './Iglesias.module.css';

/**
 * Admin → Iglesias (tablas Church → Presbytery → Zone de Neon).
 * - Se pueden agregar, renombrar, mover de presbiterio y eliminar IGLESIAS.
 * - Presbiterios y zonas son fijos: aquí solo se muestran y se eligen, no se editan.
 * - Una iglesia tiene un solo presbiterio; la zona sale del presbiterio.
 * - Con asistentes registrados no se puede eliminar (el servidor lo impide).
 */

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Iglesias() {
  const [data, setData] = useState<AdminChurchesResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [q, setQ] = useState('');
  const [zone, setZone] = useState('all');
  const [presbytery, setPresbytery] = useState('all');
  const [editing, setEditing] = useState<AdminChurchRow | 'new' | null>(null);

  const load = useCallback(() => {
    setLoadError('');
    api
      .adminChurches()
      .then(setData)
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(load, [load]);

  const zones = useMemo(() => [...new Set((data?.presbyteries ?? []).map((p) => p.zoneName))], [data]);
  const presbyteryChoices = useMemo(
    () => (data?.presbyteries ?? []).filter((p) => zone === 'all' || p.zoneName === zone),
    [data, zone],
  );

  const visible = useMemo(() => {
    const needle = norm(q.trim());
    return (data?.churches ?? []).filter(
      (c) =>
        (zone === 'all' || c.zoneName === zone) &&
        (presbytery === 'all' || c.presbyteryId === presbytery) &&
        (!needle || norm(c.name).includes(needle) || norm(c.presbyteryName).includes(needle)),
    );
  }, [data, q, zone, presbytery]);
  const paged = usePagedList(visible, `${q}|${zone}|${presbytery}`);

  const countOf = (z: string) => (data?.churches ?? []).filter((c) => z === 'all' || c.zoneName === z).length;

  return (
    <AdminShell
      title="Iglesias"
      action={
        <Button size="sm" onClick={() => setEditing('new')} disabled={!data}>
          <Plus size={15} strokeWidth={2.6} /> Nueva iglesia
        </Button>
      }
    >
      <div className={s.chips} role="tablist" aria-label="Filtrar por zona">
        {['all', ...zones].map((z) => (
          <button
            key={z}
            type="button"
            role="tab"
            aria-selected={zone === z}
            className={`${s.chip} ${zone === z ? s.chipOn : ''}`}
            onClick={() => {
              setZone(z);
              setPresbytery('all');
            }}
          >
            {z === 'all' ? 'Todas' : z} {data && <span className={s.count}>{countOf(z)}</span>}
          </button>
        ))}
      </div>

      <div className={i.tools}>
        <label className={i.search}>
          <Search size={16} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar iglesia o presbiterio" aria-label="Buscar iglesia" />
        </label>
        <select className={i.select} value={presbytery} onChange={(e) => setPresbytery(e.target.value)} aria-label="Filtrar por presbiterio">
          <option value="all">Todos los presbiterios</option>
          {presbyteryChoices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <div className={s.notice} role="alert">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {!data && !loadError && <ListSkeleton rows={5} rowClassName={i.row} label="Cargando iglesias…" />}
      {data && visible.length === 0 && <p className={s.muted}>No hay iglesias con ese filtro.</p>}

      {visible.length > 0 && (
        <ul className={s.list}>
          {paged.pageItems.map((c) => (
            <li key={c.id}>
              <button type="button" className={i.row} onClick={() => setEditing(c)}>
                <span className={i.name}>
                  <strong>{c.name}</strong>
                  <span>
                    Presbiterio {c.presbyteryName} · {c.attendees} {c.attendees === 1 ? 'asistente' : 'asistentes'}
                  </span>
                </span>
                <span className={`${i.pill} ${c.zoneName.endsWith('2') ? i.pillZone2 : ''}`}>{c.zoneName}</span>
                <ChevronRight className={i.rowChev} size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {visible.length > 0 && (
        <div className={s.pagerCard}>
          <Pagination
            label="iglesias"
            page={paged.page}
            pageSize={paged.pageSize}
            total={paged.total}
            onPageChange={paged.setPage}
            onPageSizeChange={paged.setPageSize}
          />
        </div>
      )}

      {editing && data && (
        <ChurchModal
          church={editing === 'new' ? null : editing}
          presbyteries={data.presbyteries}
          nameMax={data.nameMax}
          onClose={() => setEditing(null)}
          onChanged={load}
        />
      )}
    </AdminShell>
  );
}

function ChurchModal({
  church,
  presbyteries,
  nameMax,
  onClose,
  onChanged,
}: {
  church: AdminChurchRow | null;
  presbyteries: AdminPresbyteryOption[];
  nameMax: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(church?.name ?? '');
  const [presbyteryId, setPresbyteryId] = useState(church?.presbyteryId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const chosen = presbyteries.find((p) => p.id === presbyteryId);
  const zonesList = useMemo(() => [...new Set(presbyteries.map((p) => p.zoneName))], [presbyteries]);
  const moved = !!church && !!chosen && chosen.id !== church.presbyteryId;
  const zoneChanged = moved && chosen!.zoneName !== church!.zoneName;
  const dirty = !church || name.trim() !== church.name || moved;
  const canSave = !!name.trim() && !!presbyteryId && dirty;

  const run = async (fn: () => Promise<unknown>, after: () => void) => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await fn();
      after();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => (church ? api.updateChurch(church.id, { name, presbyteryId }) : api.createChurch({ name, presbyteryId })),
      () => (church ? setSaved(true) : onClose()),
    );

  return (
    <AdminModal title={church ? 'Editar iglesia' : 'Nueva iglesia'} onClose={onClose} busy={busy}>
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave && !busy) void save();
        }}
        noValidate
      >
        <label className={s.f}>
          <span>Nombre de la iglesia</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={nameMax} placeholder="Ej. 120va Iglesia Tijuana" autoComplete="off" />
        </label>

        <label className={s.f}>
          <span>Presbiterio</span>
          <select className={i.selectField} value={presbyteryId} onChange={(e) => setPresbyteryId(e.target.value)}>
            <option value="" disabled>
              Elige un presbiterio
            </option>
            {zonesList.map((z) => (
              <optgroup key={z} label={z}>
                {presbyteries
                  .filter((p) => p.zoneName === z)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <small className={s.small}>Una iglesia pertenece a un solo presbiterio.</small>
        </label>

        <div className={i.locked}>
          <span>
            <Lock size={12} aria-hidden="true" /> Zona (la define el presbiterio): <b>{chosen?.zoneName ?? '—'}</b>
          </span>
        </div>

        {zoneChanged && (
          <p className={i.warn}>
            Pasa de {church!.zoneName} a {chosen!.zoneName}: sus {church!.attendees} asistentes cambiarán de zona y de sede del
            domingo, y los avisos por zona les llegarán según la nueva.
          </p>
        )}
        {church && !zoneChanged && moved && (
          <p className={i.warn}>Se moverá al presbiterio {chosen!.name}. Sus asistentes conservan su registro.</p>
        )}

        {saved && (
          <p className={s.ok} role="status">
            <Check size={15} /> Cambios guardados
          </p>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        <div className={i.actions}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {saved ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button type="submit" disabled={busy || !canSave}>
            {busy ? 'Guardando…' : church ? 'Guardar cambios' : 'Agregar iglesia'}
          </Button>
        </div>
      </form>

      {church && (
        <section className={s.section}>
          <h3 className="label">Eliminar</h3>
          {church.attendees > 0 ? (
            <p className={s.hint}>
              No se puede eliminar: tiene {church.attendees} {church.attendees === 1 ? 'asistente registrado' : 'asistentes registrados'}.
              Si el nombre o el presbiterio están mal, edítalos arriba.
            </p>
          ) : confirmDelete ? (
            <>
              <p className={s.hint}>¿Eliminar “{church.name}”? Dejará de aparecer en el registro. No se puede deshacer.</p>
              <div className={i.actions}>
                <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  No, conservar
                </Button>
                <Button className={s.dangerBtn} variant="outline" disabled={busy} onClick={() => void run(() => api.deleteChurch(church.id), onClose)}>
                  {busy ? 'Eliminando…' : 'Sí, eliminar'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={s.hint}>Solo para una iglesia que se agregó por error y aún no tiene asistentes.</p>
              <Button variant="outline" className={s.dangerBtn} disabled={busy} onClick={() => setConfirmDelete(true)}>
                Eliminar iglesia
              </Button>
            </>
          )}
        </section>
      )}
    </AdminModal>
  );
}

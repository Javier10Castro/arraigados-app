import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Button from '../components/Button';
import AvailabilityStatus from '../components/AvailabilityStatus';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import { api } from '../lib/api';
import { money } from './format';
import { ListSkeleton } from '../components/Skeleton';
import type { AdminDishRow, AutoImageSearchResult, Venue } from '../../shared/api';
import u from './Usuarios.module.css';
import s from './Menu.module.css';

/**
 * Admin -> Menú (3 oct 2026): CRUD de platillos del "Menú de alimentos"
 * administrable. Ver migrations/003_menu.sql y server/dishes.ts para el
 * modelo de datos y las decisiones de producto.
 *
 * Alcance de esta entrega (explícito, pedido del cliente): SOLO la parte
 * administrable. El carrusel de /home que consumirá GET /api/menu llega en
 * una fase posterior -- esta pantalla no lo toca.
 *
 * Las sedes ("Venue") son un catálogo FIJO de 2 filas sembrado por la
 * migración -- aquí solo se listan en un <select>, nunca se crean/editan.
 *
 * Búsqueda / filtros / paginado (3 oct 2026): todo client-side -- la carga
 * sigue trayendo TODOS los platillos de una vez (GET /api/admin/dishes, sin
 * parámetros), y la búsqueda por texto, el filtro de sede/disponibilidad y
 * el paginado (8 por página, por sede) se aplican aquí en memoria. Con el
 * volumen de platillos de un menú de congreso (decenas, no miles) no hace
 * falta mover esto al servidor; si algún día crece mucho más, ahí sí
 * convendría paginar/filtrar en la query de "listDishesAdmin" en
 * server/dishes.ts en vez de aquí.
 */
const PAGE_SIZE = 8;

export default function Menu() {
  const [dishes, setDishes] = useState<AdminDishRow[] | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminDishRow | null>(null);

  const [q, setQ] = useState('');
  const [venueFilter, setVenueFilter] = useState('all');
  const [availFilter, setAvailFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  // Página actual POR sede (dos secciones, cada una pagina por su cuenta).
  const [pages, setPages] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    setLoadError('');
    api
      .adminDishes()
      .then((r) => {
        setDishes(r.dishes);
        setVenues(r.venues);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(load, [load]);

  // Cualquier cambio de filtro regresa todas las secciones a su página 1.
  useEffect(() => {
    setPages({});
  }, [q, venueFilter, availFilter]);

  const normalizedQ = q.trim().toLowerCase();
  const filtered = (dishes ?? []).filter((d) => {
    if (venueFilter !== 'all' && d.venueId !== venueFilter) return false;
    if (availFilter === 'available' && !d.available) return false;
    if (availFilter === 'unavailable' && d.available) return false;
    if (normalizedQ && !d.name.toLowerCase().includes(normalizedQ) && !d.description.toLowerCase().includes(normalizedQ)) {
      return false;
    }
    return true;
  });
  const hasActiveFilters = normalizedQ !== '' || venueFilter !== 'all' || availFilter !== 'all';
  const clearFilters = () => {
    setQ('');
    setVenueFilter('all');
    setAvailFilter('all');
  };

  // Agrupado por sede, en el orden que ya viene del servidor (por "sortOrder" de Venue).
  const groups = venues
    .filter((v) => venueFilter === 'all' || v.id === venueFilter)
    .map((v) => ({ venue: v, items: filtered.filter((d) => d.venueId === v.id) }));

  return (
    <AdminShell
      title="Menu"
      action={
        <Button size="sm" onClick={() => setCreating(true)} disabled={venues.length === 0}>
          <Plus size={15} strokeWidth={2.6} /> Agregar platillo
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

      {!dishes && !loadError && <ListSkeleton rows={4} rowClassName={s.cardSkeleton} label="Cargando platillos…" />}

      {dishes && dishes.length === 0 && !loadError && (
        <p className={s.muted}>Todavía no hay platillos. Agrega el primero con el botón de arriba.</p>
      )}

      {dishes && dishes.length > 0 && (
        <div className={s.toolbar}>
          <label className={s.searchField}>
            <Search size={15} strokeWidth={2.4} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar platillo…"
              aria-label="Buscar platillo"
            />
          </label>
          <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} aria-label="Filtrar por sede">
            <option value="all">Todas las sedes</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            value={availFilter}
            onChange={(e) => setAvailFilter(e.target.value as typeof availFilter)}
            aria-label="Filtrar por disponibilidad"
          >
            <option value="all">Disponibilidad: todas</option>
            <option value="available">Disponibles</option>
            <option value="unavailable">No disponibles</option>
          </select>
          {hasActiveFilters && (
            <button type="button" className={s.clearFilters} onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {dishes && dishes.length > 0 && filtered.length === 0 && (
        <p className={s.muted}>No se encontraron platillos con esos filtros.</p>
      )}

      {dishes &&
        groups.map(
          ({ venue, items }) =>
            items.length > 0 && (
              <DishVenueSection
                key={venue.id}
                venue={venue}
                items={items}
                page={pages[venue.id] ?? 1}
                onPageChange={(p) => setPages((prev) => ({ ...prev, [venue.id]: p }))}
                onEdit={setEditing}
              />
            ),
        )}

      {creating && (
        <DishModal
          venues={venues}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {editing && (
        <DishModal
          dish={editing}
          venues={venues}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </AdminShell>
  );
}

/** Una sección de sede: su propia tira paginada (8 por página) de tarjetas. */
function DishVenueSection({
  venue,
  items,
  page,
  onPageChange,
  onEdit,
}: {
  venue: Venue;
  items: AdminDishRow[];
  page: number;
  onPageChange: (page: number) => void;
  onEdit: (d: AdminDishRow) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // Si la página guardada quedó fuera de rango (p. ej. se borró el último
  // platillo de la última página), se cae a la última página válida en vez
  // de mostrar una lista vacía.
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section className={s.venueSection}>
      <h2 className={`label ${s.venueTitle}`}>
        {venue.name} <span className={s.countBadge}>{items.length}</span>
      </h2>
      <ul className={s.grid}>
        {pageItems.map((d) => (
          <li key={d.id}>
            <button type="button" className={s.card} onClick={() => onEdit(d)}>
              <span className={s.thumbWrap}>
                {d.imageKey ? (
                  <img className={s.thumb} src={`/api/dish-image/${encodeURIComponent(d.imageKey)}`} alt="" />
                ) : (
                  <span className={s.thumbEmpty} aria-hidden="true">
                    <ImagePlus size={20} />
                  </span>
                )}
              </span>
              <span className={s.cardBody}>
                <strong className={s.cardName}>{d.name}</strong>
                <span className={s.cardRow}>
                  <span className={s.cardPrice}>{money(d.price)}</span>
                  <AvailabilityStatus available={d.available} />
                </span>
              </span>
              <Pencil className={s.editIcon} size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className={s.pagination}>
          <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
            Anterior
          </Button>
          <span className={s.pageIndicator}>
            Página {safePage} de {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </section>
  );
}

/** Centavos -> string de pesos para el <input type="number">, sin ceros de más ("8500" -> "85"). */
function centsToPesosInput(cents: number): string {
  const pesos = cents / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

const DESCRIPTION_MAX = 500;
const NAME_MAX = 80;

function DishModal({
  dish,
  venues,
  onClose,
  onSaved,
  onDeleted,
}: {
  dish?: AdminDishRow;
  venues: Venue[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEdit = Boolean(dish);
  const [name, setName] = useState(dish?.name ?? '');
  const [description, setDescription] = useState(dish?.description ?? '');
  const [pesos, setPesos] = useState(dish ? centsToPesosInput(dish.price) : '');
  const [venueId, setVenueId] = useState(dish?.venueId ?? venues[0]?.id ?? '');
  const [available, setAvailable] = useState(dish?.available ?? true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    dish?.imageKey ? `/api/dish-image/${encodeURIComponent(dish.imageKey)}` : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Búsqueda automática de foto ("sin foto" -> Openverse, ver server/dishes.ts
  // autoFetchDishImage). `pendingAutoImageKey` es la key que YA quedó guardada
  // en Blobs como vista previa -- solo se manda al servidor (como
  // "useImageKey") si el admin la confirma con "Usar esta foto" y no elige
  // después una imagen manual (esa siempre gana, ver doSave).
  const [nag, setNag] = useState<'closed' | 'prompt' | 'searching' | 'found' | 'not_found'>('closed');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [autoResult, setAutoResult] = useState<AutoImageSearchResult | null>(null);
  const [pendingAutoImageKey, setPendingAutoImageKey] = useState<string | null>(null);
  // Fotos de Openverse ya mostradas para la búsqueda ACTUAL (su sourceId) --
  // se mandan como "exclude" para que "Buscar otra" de verdad traiga una
  // distinta en vez de repetir la misma primera foto. Se reinicia si el
  // admin edita el término de búsqueda (una búsqueda nueva no excluye nada).
  const [excludeIds, setExcludeIds] = useState<string[]>([]);

  function editSearchQuery(v: string) {
    setSearchQuery(v);
    setExcludeIds([]);
  }

  const priceCents = Math.round(Number(pesos) * 100);
  const canSubmit =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    venueId.length > 0 &&
    Number.isFinite(priceCents) &&
    priceCents >= 0 &&
    pesos.trim() !== '';

  function pickImage(file: File | null) {
    setImageFile(file);
    if (file) {
      setPreview(URL.createObjectURL(file));
      // Una foto subida a mano siempre gana sobre una encontrada automáticamente.
      setPendingAutoImageKey(null);
    } else {
      setPreview(dish?.imageKey ? `/api/dish-image/${encodeURIComponent(dish.imageKey)}` : null);
    }
  }

  /** Guarda de verdad (crear/editar), sin volver a preguntar por la foto -- lo llaman tanto el submit normal como "Continuar sin foto" desde el aviso. */
  async function doSave() {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('name', name.trim());
      form.set('description', description.trim());
      form.set('price', String(priceCents));
      form.set('available', String(available));
      form.set('venueId', venueId);
      if (imageFile) form.set('image', imageFile);
      else if (pendingAutoImageKey) form.set('useImageKey', pendingAutoImageKey);

      if (isEdit && dish) await api.adminUpdateDish(dish.id, form);
      else await api.adminCreateDish(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el platillo.');
      setBusy(false);
      setNag('closed');
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    // Sin foto (ni subida a mano, ni una ya existente, ni una auto-encontrada
    // pendiente) -- antes de guardar, ofrecer buscar una automáticamente.
    if (!imageFile && !preview && !pendingAutoImageKey) {
      setSearchQuery(name.trim());
      setSearchError('');
      setNag('prompt');
      return;
    }
    void doSave();
  }

  async function runAutoSearch() {
    if (busy) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchError('Escribe un término de búsqueda.');
      return;
    }
    setBusy(true);
    setSearchError('');
    setNag('searching');
    try {
      const { result } = await api.adminSearchDishImage(q, excludeIds);
      if (result) {
        setAutoResult(result);
        setExcludeIds((prev) => [...prev, result.sourceId]);
        setNag('found');
      } else {
        setNag('not_found');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'No se pudo buscar la foto.');
      setNag('prompt');
    } finally {
      setBusy(false);
    }
  }

  function useAutoResult() {
    if (!autoResult) return;
    setPreview(autoResult.previewUrl);
    setPendingAutoImageKey(autoResult.imageKey);
    setImageFile(null);
    setNag('closed');
  }

  async function doDelete() {
    if (!dish || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.adminDeleteDish(dish.id);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el platillo.');
      setBusy(false);
    }
  }

  if (confirmDelete && dish) {
    return (
      <AdminModal title="Eliminar platillo" onClose={() => setConfirmDelete(false)} busy={busy}>
        <p className={u.hint}>
          ¿Eliminar <b>{dish.name}</b>? Esta acción no se puede deshacer -- se borra el platillo y, si tenía, su foto.
        </p>
        {error && (
          <p className={u.error} role="alert">
            {error}
          </p>
        )}
        <div className={u.actions}>
          <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button className={s.dangerBtn} disabled={busy} onClick={() => void doDelete()}>
            {busy ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </div>
      </AdminModal>
    );
  }

  if (nag !== 'closed') {
    return (
      <AdminModal title="Sin foto todavía" onClose={() => !busy && setNag('closed')} busy={busy}>
        {(nag === 'prompt' || nag === 'searching') && (
          <>
            <p className={u.hint}>
              No le pusiste foto a <b>{name.trim() || 'este platillo'}</b>. Puedo buscar una en internet usando el nombre.
            </p>
            <label className={u.f}>
              <span>Buscar como</span>
              <input
                value={searchQuery}
                onChange={(e) => editSearchQuery(e.target.value)}
                placeholder="Ej. Tacos de Asada"
                disabled={busy}
                autoComplete="off"
              />
            </label>
            {searchError && (
              <p className={u.error} role="alert">
                {searchError}
              </p>
            )}
            <div className={s.nagActions}>
              <Button block disabled={busy} onClick={() => void runAutoSearch()}>
                <Search size={15} strokeWidth={2.6} /> {nag === 'searching' ? 'Buscando…' : 'Buscar foto'}
              </Button>
              <Button block variant="outline" disabled={busy} onClick={() => void doSave()}>
                Continuar sin foto
              </Button>
            </div>
          </>
        )}

        {nag === 'found' && autoResult && (
          <>
            <div className={s.nagPreviewWrap}>
              <img src={autoResult.previewUrl} alt="" className={s.nagPreview} />
            </div>
            <p className={s.nagCaption}>
              Encontrado como "{autoResult.title}" · {autoResult.creator ? `${autoResult.creator} · ` : ''}
              {autoResult.license}
            </p>
            <div className={s.nagActions}>
              <Button block disabled={busy} onClick={useAutoResult}>
                Usar esta foto
              </Button>
              <Button block variant="outline" disabled={busy} onClick={() => void runAutoSearch()}>
                <Search size={15} strokeWidth={2.6} /> Buscar otra
              </Button>
              <Button block variant="outline" disabled={busy} onClick={() => void doSave()}>
                Continuar sin foto
              </Button>
            </div>
          </>
        )}

        {nag === 'not_found' && (
          <>
            <p className={u.hint}>No encontré ninguna foto para "{searchQuery}". Puedes intentar con otro término o subir una tú mismo.</p>
            <div className={s.nagActions}>
              <Button block disabled={busy} onClick={() => setNag('prompt')}>
                Intentar de nuevo
              </Button>
              <Button block variant="outline" disabled={busy} onClick={() => void doSave()}>
                Continuar sin foto
              </Button>
            </div>
          </>
        )}
      </AdminModal>
    );
  }

  return (
    <AdminModal title={isEdit ? 'Editar platillo' : 'Nuevo platillo'} onClose={onClose} busy={busy}>
      <form className={u.form} onSubmit={submit} noValidate>
        <div className={s.imagePicker}>
          <button type="button" className={s.imageButton} onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {preview ? (
              <img src={preview} alt="" className={s.imagePreview} />
            ) : (
              <span className={s.imagePlaceholder}>
                <ImagePlus size={22} />
                <span>Agregar foto</span>
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={s.hiddenFileInput}
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
          />
          <p className={u.hint}>JPG, PNG o WebP, máximo 4 MB.</p>
        </div>

        <label className={u.f}>
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tacos de Asada" maxLength={NAME_MAX} autoComplete="off" />
        </label>

        <label className={u.f}>
          <span>Descripción</span>
          <textarea
            className={s.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Tortilla de maíz, carne asada, cebolla, cilantro y salsa al gusto."
            maxLength={DESCRIPTION_MAX}
          />
        </label>

        <div className={s.row2}>
          <label className={u.f}>
            <span>Precio (MXN)</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={pesos}
              onChange={(e) => setPesos(e.target.value)}
              placeholder="85"
            />
          </label>
          <label className={u.f}>
            <span>Sede</span>
            <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={s.toggleRow}>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          <span>Disponible</span>
        </label>
        <p className={u.hint}>
          {available
            ? 'Se muestra como disponible en el menú.'
            : 'Se sigue viendo en el menú, pero marcado como "No disponible".'}
        </p>

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
            {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear platillo'}
          </Button>
        </div>

        {isEdit && (
          <button type="button" className={s.deleteLink} onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 size={14} /> Eliminar platillo
          </button>
        )}
      </form>
    </AdminModal>
  );
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, GripVertical, ImagePlus, Images, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Button from '../components/Button';
import Badge from '../components/Badge';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import { api } from '../lib/api';
import { ListSkeleton } from '../components/Skeleton';
import { formatPrice } from '../data/app';
import { MERCH_AVAILABILITY_LABEL, type AdminMerchItem, type MerchAvailability } from '../../shared/api';
import u from './Usuarios.module.css';
import m from './Menu.module.css';
import s from './Merch.module.css';

/**
 * Admin -> Mercancía (3-4 oct 2026, conectada a datos reales el 3 oct):
 * CRUD de artículos de la vitrina "Mercancía oficial" de /home. Ver
 * migrations/004_merch.sql y server/merch.ts para el modelo de datos y las
 * decisiones de producto -- en particular: catálogo puramente EDITORIAL
 * (jamás inventario/ventas, confirmado explícitamente por el cliente) y un
 * artículo puede tener VARIAS fotos (a diferencia de /admin/menu).
 *
 * Búsqueda / filtro de disponibilidad / paginado (4 oct 2026, pedido de
 * Javier): todo client-side, igual criterio que /admin/menu -- la carga
 * sigue trayendo TODOS los artículos de una vez (GET /api/admin/merch, sin
 * parámetros), y la búsqueda/filtro/paginado (8 por página) se aplican aquí
 * en memoria. El botón de subir/bajar un artículo mueve su posición real en
 * la vitrina (su "sortOrder" en el servidor) -- por eso solo se ofrece
 * cuando NO hay filtros activos: con la lista filtrada, "subir" dejaría de
 * corresponder al vecino real y confundiría más de lo que ayuda.
 *
 * Mismo lenguaje visual que /admin/menu (Menu.tsx/Menu.module.css) a
 * propósito, para que el panel se sienta como una sola herramienta.
 */
const PAGE_SIZE = 8;

export default function Merch() {
  const [items, setItems] = useState<AdminMerchItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminMerchItem | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [availFilter, setAvailFilter] = useState<'all' | MerchAvailability>('all');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoadError('');
    api
      .adminMerch()
      .then((r) => setItems(r.items))
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(load, [load]);

  // Cualquier cambio de filtro regresa a la página 1.
  useEffect(() => {
    setPage(1);
  }, [q, availFilter]);

  async function move(id: string, dir: -1 | 1) {
    if (movingId) return;
    setMovingId(id);
    try {
      await api.adminReorderMerch(id, dir);
      load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo reordenar.');
    } finally {
      setMovingId(null);
    }
  }

  const normalizedQ = q.trim().toLowerCase();
  const filtered = (items ?? []).filter((it) => {
    if (availFilter !== 'all' && it.availability !== availFilter) return false;
    if (normalizedQ && !it.name.toLowerCase().includes(normalizedQ) && !it.description.toLowerCase().includes(normalizedQ)) {
      return false;
    }
    return true;
  });
  const hasActiveFilters = normalizedQ !== '' || availFilter !== 'all';
  const clearFilters = () => {
    setQ('');
    setAvailFilter('all');
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <AdminShell
      title="Mercancia"
      action={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={15} strokeWidth={2.6} /> Agregar artículo
        </Button>
      }
    >
      {loadError && (
        <div className={m.notice} role="alert">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}

      {!items && !loadError && <ListSkeleton rows={4} rowClassName={s.rowSkeleton} label="Cargando mercancía…" />}

      {items && items.length === 0 && !loadError && (
        <p className={m.muted}>No hay artículos todavía. Agrega el primero con el botón de arriba.</p>
      )}

      {items && items.length > 0 && (
        <div className={m.toolbar}>
          <label className={m.searchField}>
            <Search size={15} strokeWidth={2.4} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar artículo…"
              aria-label="Buscar artículo"
            />
          </label>
          <select value={availFilter} onChange={(e) => setAvailFilter(e.target.value as typeof availFilter)} aria-label="Filtrar por disponibilidad">
            <option value="all">Disponibilidad: todas</option>
            <option value="tbd">{MERCH_AVAILABILITY_LABEL.tbd}</option>
            <option value="onsite">{MERCH_AVAILABILITY_LABEL.onsite}</option>
          </select>
          {hasActiveFilters && (
            <button type="button" className={m.clearFilters} onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {items && items.length > 0 && filtered.length === 0 && <p className={m.muted}>No se encontraron artículos con esos filtros.</p>}

      {filtered.length > 0 && (
        <>
          <ul className={s.list}>
            {pageItems.map((item) => {
              // Posición REAL en la vitrina (ignora filtro/paginado) -- de
              // eso depende si "subir"/"bajar" deben deshabilitarse por
              // estar ya en una punta.
              const realIdx = items!.findIndex((it) => it.id === item.id);
              return (
                <li key={item.id} className={s.row}>
                  {!hasActiveFilters ? (
                    <div className={s.orderControls}>
                      <button type="button" aria-label={`Subir ${item.name}`} disabled={realIdx === 0 || movingId !== null} onClick={() => move(item.id, -1)}>
                        <ChevronUp size={15} strokeWidth={2.4} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${item.name}`}
                        disabled={realIdx === items!.length - 1 || movingId !== null}
                        onClick={() => move(item.id, 1)}
                      >
                        <ChevronDown size={15} strokeWidth={2.4} />
                      </button>
                    </div>
                  ) : (
                    <div className={s.orderControls} aria-hidden="true" />
                  )}

                  <button type="button" className={`${m.card} ${s.cardInRow}`} onClick={() => setEditing(item)}>
                    <span className={`${m.thumbWrap} ${s.thumbWrapPos}`}>
                      {item.images[0] ? (
                        <img className={m.thumb} src={item.images[0].imageUrl} alt="" />
                      ) : (
                        <span className={m.thumbEmpty} aria-hidden="true">
                          <ImagePlus size={20} />
                        </span>
                      )}
                      {item.images.length > 1 && (
                        <span className={s.thumbCount} aria-hidden="true">
                          <Images size={10} strokeWidth={2.6} /> {item.images.length}
                        </span>
                      )}
                    </span>
                    <span className={m.cardBody}>
                      <strong className={m.cardName}>{item.name}</strong>
                      <span className={m.cardRow}>
                        {item.price != null && <span className={m.cardPrice}>{formatPrice(item.price)}</span>}
                        <Badge variant="plain">{MERCH_AVAILABILITY_LABEL[item.availability]}</Badge>
                      </span>
                    </span>
                    <Pencil className={m.editIcon} size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className={s.pagination}>
              <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                Anterior
              </Button>
              <span className={s.pageIndicator}>
                Página {safePage} de {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                Siguiente
              </Button>
            </div>
          )}
        </>
      )}

      {creating && (
        <MerchItemModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {editing && (
        <MerchItemModal
          item={editing}
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

const DESCRIPTION_MAX = 400;
const NAME_MAX = 60;
const MAX_IMAGES = 6;

/** Centavos -> string de pesos ENTEROS para el input, vacío si no hay precio aún.
 * Mercancía no usa centavos (pedido de Javier, 4 oct 2026: "100" debe
 * guardarse como $100 MXN, no $1.00) -- el precio en pantalla siempre es un
 * número entero de pesos; por dentro se sigue guardando en centavos nada
 * más para compartir formatPrice()/el mismo tipo de columna que el resto de
 * la app (Dish, Package), redondeando siempre a un múltiplo exacto de 100. */
function centsToPesosInput(cents: number | null): string {
  if (cents == null) return '';
  return String(Math.round(cents / 100));
}

/**
 * Una entrada de la galería del formulario -- YA EXISTENTE (subida en una
 * edición anterior) o NUEVA (elegida en esta sesión de edición, todavía sin
 * subir). Viven juntas en UN solo arreglo ordenable (4 oct 2026, pedido de
 * Javier: poder decidir el orden en que aparecen/rotan del lado del
 * asistente, intercalando fotos nuevas entre las que ya había) -- ver
 * updateMerchItem en server/merch.ts para cómo se manda ese orden mezclado.
 */
type GalleryEntry = { key: string } & ({ kind: 'existing'; id: string; url: string } | { kind: 'new'; file: File; url: string });

function MerchItemModal({
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  item?: AdminMerchItem;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEdit = Boolean(item);
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [pesos, setPesos] = useState(centsToPesosInput(item?.price ?? null));
  const [availability, setAvailability] = useState<MerchAvailability>(item?.availability ?? 'tbd');
  const [gallery, setGallery] = useState<GalleryEntry[]>(
    () => item?.images.map((img) => ({ key: img.id, kind: 'existing' as const, id: img.id, url: img.imageUrl })) ?? [],
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const priceValid = pesos.trim() === '' || (Number.isInteger(Number(pesos)) && Number(pesos) >= 0);
  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && priceValid;

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - gallery.length;
    if (room <= 0) {
      setError(`Un artículo no puede tener más de ${MAX_IMAGES} fotos.`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    setGallery((prev) => [
      ...prev,
      ...picked.map((file) => ({ key: `new-${Date.now()}-${Math.random()}`, kind: 'new' as const, file, url: URL.createObjectURL(file) })),
    ]);
  }

  function removeEntry(key: string) {
    setGallery((prev) => {
      const entry = prev.find((e) => e.key === key);
      if (entry?.kind === 'existing') setRemovedIds((ids) => [...ids, entry.id]);
      return prev.filter((e) => e.key !== key);
    });
  }

  function moveEntry(key: string, dir: -1 | 1) {
    setGallery((prev) => {
      const idx = prev.findIndex((e) => e.key === key);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  /** Arrastrar y soltar (4 oct 2026, pedido de Javier): mueve `sourceKey` a
   * la posición donde está `targetKey` ahora mismo. Las flechas arriba se
   * dejan como alternativa accesible (teclado/touch sin drag), pero el
   * arrastre es la forma principal de reordenar la galería. */
  function moveEntryTo(sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey) return;
    setGallery((prev) => {
      const sourceIdx = prev.findIndex((e) => e.key === sourceKey);
      const targetIdx = prev.findIndex((e) => e.key === targetKey);
      if (sourceIdx < 0 || targetIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  }

  async function doSave() {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('name', name.trim());
      form.set('description', description.trim());
      // BUG corregido (4 oct 2026): esto mandaba los pesos tal cual
      // ("100") y el servidor los guardaba como si ya fueran centavos --
      // $100 MXN se guardaba y volvía a mostrar como $1.00. Precio en
      // pantalla = pesos enteros; lo que viaja al servidor son centavos
      // (mismo criterio que Dish en /admin/menu).
      const priceCents = pesos.trim() === '' ? '' : String(Math.round(Number(pesos)) * 100);
      form.set('price', priceCents);
      form.set('availability', availability);

      // El orden final combinado (existentes + nuevas intercaladas, tal como
      // quedó la galería en pantalla) -- ver el comentario de GalleryEntry.
      const orderTokens: string[] = [];
      let newIdx = 0;
      for (const entry of gallery) {
        if (entry.kind === 'existing') {
          orderTokens.push(entry.id);
        } else {
          form.append('images', entry.file);
          orderTokens.push(`new:${newIdx}`);
          newIdx++;
        }
      }

      if (isEdit) {
        form.set('removeImageIds', JSON.stringify(removedIds));
        form.set('imageOrder', JSON.stringify(orderTokens));
        await api.adminUpdateMerch(item!.id, form);
      } else {
        await api.adminCreateMerch(form);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el artículo.');
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    void doSave();
  }

  async function doDelete() {
    if (!item || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.adminDeleteMerch(item.id);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el artículo.');
      setBusy(false);
    }
  }

  if (confirmDelete && item) {
    return (
      <AdminModal title="Eliminar artículo" onClose={() => setConfirmDelete(false)} busy={busy}>
        <p className={u.hint}>
          ¿Eliminar <b>{item.name}</b> de la vitrina? Esta acción no se puede deshacer -- se borra el artículo y todas sus fotos.
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
          <Button className={m.dangerBtn} disabled={busy} onClick={() => void doDelete()}>
            {busy ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </div>
      </AdminModal>
    );
  }

  return (
    <AdminModal title={isEdit ? 'Editar artículo' : 'Nuevo artículo'} onClose={onClose} busy={busy}>
      <form className={u.form} onSubmit={submit} noValidate>
        <div className={s.gallery}>
          <span className={u.f}>
            <span>
              Fotos ({gallery.length}/{MAX_IMAGES})
            </span>
          </span>

          {gallery.length > 0 && (
            <ul className={s.galleryList}>
              {gallery.map((entry, idx) => (
                <li
                  key={entry.key}
                  className={[s.galleryRow, dragKey === entry.key ? s.galleryRowDragging : '', dragOverKey === entry.key && dragKey && dragKey !== entry.key ? s.galleryRowDragOver : ''].join(' ').trim()}
                  draggable
                  onDragStart={(e) => {
                    setDragKey(entry.key);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverKey !== entry.key) setDragOverKey(entry.key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === entry.key ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragKey) moveEntryTo(dragKey, entry.key);
                    setDragKey(null);
                    setDragOverKey(null);
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    setDragOverKey(null);
                  }}
                >
                  <span className={s.dragHandle} aria-hidden="true">
                    <GripVertical size={16} strokeWidth={2.2} />
                  </span>
                  <img src={entry.url} alt="" className={s.galleryRowThumb} />
                  <span className={s.galleryRowInfo}>
                    <span className={s.galleryRowTitle}>{idx === 0 ? 'Portada' : `Foto ${idx + 1}`}</span>
                    {entry.kind === 'new' && <span className={s.galleryNewTag}>Nueva</span>}
                  </span>
                  <div className={s.galleryRowControls}>
                    <button type="button" disabled={idx === 0} aria-label="Mover antes" onClick={() => moveEntry(entry.key, -1)}>
                      <ChevronUp size={14} strokeWidth={2.6} />
                    </button>
                    <button type="button" disabled={idx === gallery.length - 1} aria-label="Mover después" onClick={() => moveEntry(entry.key, 1)}>
                      <ChevronDown size={14} strokeWidth={2.6} />
                    </button>
                  </div>
                  <button type="button" className={s.galleryRemove} aria-label="Quitar foto" onClick={() => removeEntry(entry.key)}>
                    <X size={14} strokeWidth={2.6} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {gallery.length < MAX_IMAGES && (
            <button type="button" className={s.galleryAdd} onClick={() => fileInputRef.current?.click()}>
              <ImagePlus size={17} strokeWidth={2.2} />
              <span>Agregar fotos</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className={m.hiddenFileInput}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <p className={u.hint}>
            JPG, PNG o WebP, máximo 4 MB c/u -- hasta {MAX_IMAGES} fotos. Arrastra una fila para reordenarla (la primera es la
            portada) -- el mismo orden es el que usa la galería que ve el asistente, incluyendo las fotos nuevas intercaladas
            entre las que ya había.
          </p>
        </div>

        <label className={u.f}>
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vaso reutilizable" maxLength={NAME_MAX} autoComplete="off" />
        </label>

        <label className={u.f}>
          <span>Descripción</span>
          <textarea
            className={m.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Vaso con tapa y popote, con la identidad de Red Juvenil Tijuana."
            maxLength={DESCRIPTION_MAX}
          />
        </label>

        <div className={m.row2}>
          <label className={u.f}>
            <span>Precio (MXN) -- opcional</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={pesos}
              onChange={(e) => setPesos(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Sin definir"
            />
          </label>
          <label className={u.f}>
            <span>Disponibilidad</span>
            <select value={availability} onChange={(e) => setAvailability(e.target.value as MerchAvailability)}>
              <option value="tbd">{MERCH_AVAILABILITY_LABEL.tbd}</option>
              <option value="onsite">{MERCH_AVAILABILITY_LABEL.onsite}</option>
            </select>
          </label>
        </div>
        {!priceValid && (
          <p className={u.error} role="alert">
            El precio debe ser un número válido (o déjalo vacío si todavía no se define).
          </p>
        )}

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
            {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear artículo'}
          </Button>
        </div>

        {isEdit && (
          <button type="button" className={m.deleteLink} onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 size={14} /> Eliminar artículo
          </button>
        )}
      </form>
    </AdminModal>
  );
}

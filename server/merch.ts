import { getStore } from '@netlify/blobs';
import { writeAudit } from './audit';
import { NOW_UTC, newId, query } from './db';

/**
 * Lógica de "Mercancía oficial" administrable (3 oct 2026). Ver
 * migrations/004_merch.sql para el esquema completo y las decisiones de
 * producto -- en particular: es un catálogo puramente EDITORIAL (sin
 * inventario/ventas/carrito, confirmado explícitamente por el cliente) y
 * cada artículo puede tener VARIAS fotos (tabla "MerchImage" aparte), a
 * diferencia de "Dish" en server/dishes.ts que solo tiene una.
 *
 * Fotos: viven en Netlify Blobs (store "merch-photos"), NUNCA en Postgres.
 * Mismo patrón anti-huérfanos que dishes.ts: subir primero, actualizar la
 * fila después, borrar lo viejo al final -- si algo falla a la mitad, el
 * artículo nunca se queda en un estado roto.
 */

const MERCH_IMAGE_STORE = 'merch-photos';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_IMAGES_PER_ITEM = 6;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class MerchValidationError extends Error {}

function imageStore() {
  // consistency: 'strong' -- igual razón que dishes.ts: el admin sube/borra
  // una foto y espera verla reflejada de inmediato, no ~60s después.
  return getStore({ name: MERCH_IMAGE_STORE, consistency: 'strong' });
}

type MerchItemRow = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  availability: 'tbd' | 'onsite';
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type MerchImageRow = {
  id: string;
  merchItemId: string;
  imageKey: string;
  sortOrder: number;
};

async function imagesByItemIds(ids: string[]): Promise<Map<string, MerchImageRow[]>> {
  const map = new Map<string, MerchImageRow[]>();
  if (ids.length === 0) return map;
  const { rows } = await query<MerchImageRow>(
    `SELECT id, "merchItemId", "imageKey", "sortOrder" FROM "MerchImage" WHERE "merchItemId" = ANY($1) ORDER BY "sortOrder"`,
    [ids],
  );
  for (const r of rows) {
    const list = map.get(r.merchItemId) ?? [];
    list.push(r);
    map.set(r.merchItemId, list);
  }
  return map;
}

function toAdminRow(r: MerchItemRow, images: MerchImageRow[]) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    price: r.price,
    availability: r.availability,
    images: images.map((img) => ({ id: img.id, imageUrl: `/api/merch-image/${encodeURIComponent(img.imageKey)}` })),
    sortOrder: r.sortOrder,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

/** Todos los artículos (cualquier disponibilidad), para /admin/merch. */
export async function listMerchAdmin() {
  const { rows } = await query<MerchItemRow>(`SELECT * FROM "MerchItem" ORDER BY "sortOrder", "name"`);
  const imagesByItem = await imagesByItemIds(rows.map((r) => r.id));
  return rows.map((r) => toAdminRow(r, imagesByItem.get(r.id) ?? []));
}

/** Catálogo completo, listo para la vitrina de /home. Muestra TODOS los artículos (no hay concepto de "oculto"). */
export async function listMerchPublic() {
  const { rows } = await query<MerchItemRow>(`SELECT * FROM "MerchItem" ORDER BY "sortOrder", "name"`);
  const imagesByItem = await imagesByItemIds(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    price: r.price,
    availability: r.availability,
    images: (imagesByItem.get(r.id) ?? []).map((img) => `/api/merch-image/${encodeURIComponent(img.imageKey)}`),
  }));
}

async function getItemRow(id: string): Promise<MerchItemRow | null> {
  const { rows } = await query<MerchItemRow>(`SELECT * FROM "MerchItem" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getMerchAdmin(id: string) {
  const row = await getItemRow(id);
  if (!row) return null;
  const imagesByItem = await imagesByItemIds([id]);
  return toAdminRow(row, imagesByItem.get(id) ?? []);
}

type ParsedMerchForm = {
  name: string;
  description: string;
  price: number | null;
  availability: 'tbd' | 'onsite';
};

function parseMerchForm(form: FormData): ParsedMerchForm {
  const name = String(form.get('name') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const priceRaw = String(form.get('price') ?? '').trim();
  const availabilityRaw = String(form.get('availability') ?? 'tbd').trim();

  if (!name) throw new MerchValidationError('Escribe el nombre del artículo.');
  if (name.length > 60) throw new MerchValidationError('El nombre es demasiado largo (máximo 60 caracteres).');
  if (!description) throw new MerchValidationError('Escribe una descripción.');
  if (description.length > 400) throw new MerchValidationError('La descripción es demasiado larga (máximo 400 caracteres).');

  let price: number | null = null;
  if (priceRaw !== '') {
    price = Math.round(Number(priceRaw));
    if (!Number.isFinite(price) || Number.isNaN(price) || price < 0) {
      throw new MerchValidationError('El precio no es válido.');
    }
  }

  if (availabilityRaw !== 'tbd' && availabilityRaw !== 'onsite') {
    throw new MerchValidationError('Disponibilidad inválida.');
  }

  return { name, description, price, availability: availabilityRaw };
}

/** Sube los archivos "images" del form (0 o más) a Blobs. No toca la base de datos. */
async function uploadNewImages(form: FormData, itemId: string): Promise<string[]> {
  const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  const keys: string[] = [];
  for (const file of files) {
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) throw new MerchValidationError('Cada foto debe ser JPG, PNG o WebP.');
    if (file.size > MAX_IMAGE_BYTES) throw new MerchValidationError('Cada foto no puede pesar más de 4 MB.');
    // Key única por subida (nunca se reusa) -- mismo motivo que dishes.ts.
    const key = `${itemId}-${Date.now()}-${keys.length}.${ext}`;
    await imageStore().set(key, file, { metadata: { contentType: file.type } });
    keys.push(key);
  }
  return keys;
}

export async function createMerchItem(form: FormData, actorId: string) {
  const data = parseMerchForm(form);
  const id = newId();

  const { rows: maxRows } = await query<{ max: number | null }>(`SELECT MAX("sortOrder") AS max FROM "MerchItem"`);
  const sortOrder = (maxRows[0]?.max ?? -1) + 1;

  const newKeys = await uploadNewImages(form, id);
  if (newKeys.length > MAX_IMAGES_PER_ITEM) {
    throw new MerchValidationError(`Un artículo no puede tener más de ${MAX_IMAGES_PER_ITEM} fotos.`);
  }

  await query(
    `INSERT INTO "MerchItem" (id, name, description, price, availability, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, ${NOW_UTC}, ${NOW_UTC})`,
    [id, data.name, data.description, data.price, data.availability, sortOrder],
  );

  for (let i = 0; i < newKeys.length; i++) {
    await query(
      `INSERT INTO "MerchImage" (id, "merchItemId", "imageKey", "sortOrder", "createdAt") VALUES ($1, $2, $3, $4, ${NOW_UTC})`,
      [newId(), id, newKeys[i], i],
    );
  }

  await writeAudit(actorId, 'merch.create', 'MerchItem', id, { name: data.name, price: data.price, availability: data.availability });
  return getMerchAdmin(id);
}

/**
 * Edita un artículo Y su galería de fotos en una sola llamada (así lo guarda
 * el admin con un solo "Guardar cambios"):
 *   - "removeImageIds": JSON con los ids de MerchImage a borrar (y su blob).
 *   - "images": archivos nuevos (0 o más).
 *   - "imageOrder": JSON con el orden final COMBINADO de fotos existentes y
 *     nuevas, tal como el admin las dejó acomodadas en /admin/merch -- cada
 *     entrada es el id de una MerchImage existente, o "new:N" para la
 *     N-ésima foto nueva (0-based, en el mismo orden en que se mandaron los
 *     archivos de "images"). Esto es lo que permite intercalar fotos
 *     recién subidas ENTRE las que ya existían, no solo agregarlas al
 *     final. Si viene vacío, se usa el orden por default (existentes en su
 *     orden actual, nuevas al final).
 */
export async function updateMerchItem(id: string, form: FormData, actorId: string) {
  const existing = await getItemRow(id);
  if (!existing) throw new MerchValidationError('Ese artículo ya no existe.');

  const data = parseMerchForm(form);

  const removeImageIds: string[] = JSON.parse(String(form.get('removeImageIds') ?? '[]'));
  const orderTokens: string[] = JSON.parse(String(form.get('imageOrder') ?? '[]'));

  const { rows: currentImages } = await query<MerchImageRow>(
    `SELECT id, "merchItemId", "imageKey", "sortOrder" FROM "MerchImage" WHERE "merchItemId" = $1 ORDER BY "sortOrder"`,
    [id],
  );
  const keptImages = currentImages.filter((img) => !removeImageIds.includes(img.id));

  const newKeys = await uploadNewImages(form, id);
  if (keptImages.length + newKeys.length > MAX_IMAGES_PER_ITEM) {
    throw new MerchValidationError(`Un artículo no puede tener más de ${MAX_IMAGES_PER_ITEM} fotos.`);
  }

  await query(
    `UPDATE "MerchItem" SET name = $2, description = $3, price = $4, availability = $5, "updatedAt" = ${NOW_UTC} WHERE id = $1`,
    [id, data.name, data.description, data.price, data.availability],
  );

  // Orden final combinado: el que mandó el admin ("imageOrder"), filtrando
  // cualquier referencia inválida (a una foto quitada o a un índice "new:N"
  // fuera de rango -- no debería pasar, pero nunca se confía del todo en lo
  // que manda el cliente); si no mandó nada útil, cae al default de
  // siempre: existentes en su orden actual, nuevas al final.
  type OrderEntry = { existingId?: string; newIdx?: number };
  let order: OrderEntry[] = orderTokens
    .map((t): OrderEntry => (t.startsWith('new:') ? { newIdx: Number(t.slice(4)) } : { existingId: t }))
    .filter((e) => (e.existingId ? keptImages.some((img) => img.id === e.existingId) : e.newIdx! >= 0 && e.newIdx! < newKeys.length));
  if (order.length === 0 && (keptImages.length > 0 || newKeys.length > 0)) {
    order = [...keptImages.map((img) => ({ existingId: img.id })), ...newKeys.map((_, i) => ({ newIdx: i }))];
  }

  let sortOrder = 0;
  for (const entry of order) {
    if (entry.existingId) {
      await query(`UPDATE "MerchImage" SET "sortOrder" = $2 WHERE id = $1`, [entry.existingId, sortOrder]);
    } else {
      await query(
        `INSERT INTO "MerchImage" (id, "merchItemId", "imageKey", "sortOrder", "createdAt") VALUES ($1, $2, $3, $4, ${NOW_UTC})`,
        [newId(), id, newKeys[entry.newIdx!], sortOrder],
      );
    }
    sortOrder++;
  }

  // Las filas de las fotos QUITADAS se borran explícitamente -- antes de
  // este cambio solo se dejaban de reordenar, pero la fila en "MerchImage"
  // se quedaba huérfana apuntando a un blob que se borra abajo.
  if (removeImageIds.length > 0) {
    await query(`DELETE FROM "MerchImage" WHERE id = ANY($1)`, [removeImageIds]);
  }

  // Solo ahora, con la BD ya consistente, se borran de Blobs las fotos
  // quitadas -- si el borrado del blob falla, queda un archivo huérfano
  // inofensivo en vez de un artículo roto (mismo criterio que dishes.ts).
  const toDelete = currentImages.filter((img) => removeImageIds.includes(img.id));
  for (const img of toDelete) {
    await imageStore()
      .delete(img.imageKey)
      .catch((err) => console.error('[merch] no se pudo borrar la imagen vieja', img.imageKey, err));
  }

  // Solo lo que realmente cambió.
  const changes: Record<string, unknown> = { item: data.name };
  if (existing.name !== data.name) changes.name = { from: existing.name, to: data.name };
  if (existing.price !== data.price) changes.price = { from: existing.price, to: data.price };
  if (existing.availability !== data.availability) changes.availability = { from: existing.availability, to: data.availability };
  if (existing.description !== data.description) changes.description = true;
  if (removeImageIds.length > 0 || newKeys.length > 0) changes.images = true;
  if (Object.keys(changes).length > 1) await writeAudit(actorId, 'merch.update', 'MerchItem', id, changes);

  return getMerchAdmin(id);
}

export async function deleteMerchItem(id: string, actorId: string) {
  const existing = await getItemRow(id);
  if (!existing) throw new MerchValidationError('Ese artículo ya no existe.');

  const { rows: images } = await query<MerchImageRow>(`SELECT * FROM "MerchImage" WHERE "merchItemId" = $1`, [id]);

  // ON DELETE CASCADE se encarga de las filas de "MerchImage"; los blobs se
  // borran aparte (Blobs no sabe nada de la base de datos).
  await query(`DELETE FROM "MerchItem" WHERE id = $1`, [id]);
  await writeAudit(actorId, 'merch.delete', 'MerchItem', id, { name: existing.name, price: existing.price });

  for (const img of images) {
    await imageStore()
      .delete(img.imageKey)
      .catch((err) => console.error('[merch] no se pudo borrar la imagen al eliminar', img.imageKey, err));
  }
}

/** Intercambia el "sortOrder" de un artículo con su vecino inmediato (subir/bajar en /admin/merch). */
export async function moveMerchItem(id: string, dir: -1 | 1) {
  const { rows } = await query<{ id: string; sortOrder: number }>(`SELECT id, "sortOrder" FROM "MerchItem" ORDER BY "sortOrder", name`);
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = idx + dir;
  if (idx < 0) throw new MerchValidationError('Ese artículo ya no existe.');
  if (swapIdx < 0 || swapIdx >= rows.length) return; // ya está en la punta, no hay nada que mover

  const a = rows[idx];
  const b = rows[swapIdx];
  await query(`UPDATE "MerchItem" SET "sortOrder" = $2 WHERE id = $1`, [a.id, b.sortOrder]);
  await query(`UPDATE "MerchItem" SET "sortOrder" = $2 WHERE id = $1`, [b.id, a.sortOrder]);
}

/** Para la función pública que sirve el archivo (GET /api/merch-image/:key). */
export async function getMerchImage(key: string): Promise<{ blob: Blob; contentType: string } | null> {
  const store = imageStore();
  const blob = await store.get(key, { type: 'blob' });
  if (!blob) return null;
  const meta = await store.getMetadata(key).catch(() => null);
  const contentType = (meta?.metadata?.contentType as string | undefined) ?? 'application/octet-stream';
  return { blob, contentType };
}

import { getStore } from '@netlify/blobs';
import { NOW_UTC, newId, query } from './db';
import { searchOpenverseImage } from './openverseSearch';

/**
 * Lógica del "Menú de alimentos" administrable (3 oct 2026). Ver
 * migrations/003_menu.sql para el esquema completo y las decisiones de
 * producto que modela -- en particular: "Venue" es un catálogo FIJO de 2
 * filas (no hay CRUD de sedes en ningún lado de esta app).
 *
 * Fotos: viven en Netlify Blobs (store "dish-photos"), NUNCA en Postgres --
 * la tabla "Dish" solo guarda "imageKey". Flujo de reemplazo sin huérfanos
 * (ver saveImageIfPresent/updateDish): se sube el archivo nuevo, se actualiza
 * la fila, y SOLO DESPUÉS se borra la key vieja -- si algo falla a la mitad,
 * el platillo nunca queda sin una imagen válida.
 */

const DISH_IMAGE_STORE = 'dish-photos';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class DishValidationError extends Error {}

function imageStore() {
  // consistency: 'strong' -- al reemplazar una foto, la nueva debe quedar
  // disponible de inmediato (ver guía de Netlify Blobs: default es
  // eventual, ~60s de propagación, que no sirve para "admin sube y ya").
  return getStore({ name: DISH_IMAGE_STORE, consistency: 'strong' });
}

/** Las 2 sedes fijas del Congreso, en orden. Sin filtro de "activa": no existe ese concepto aquí. */
export async function listVenues(): Promise<{ id: string; name: string }[]> {
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM "Venue" ORDER BY "sortOrder"`,
  );
  return rows;
}

type DishJoinRow = {
  id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  venueId: string;
  venueName: string;
  imageKey: string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const DISH_SELECT = `
  SELECT d.id, d.name, d.description, d.price, d.available, d."venueId",
         v.name AS "venueName", d."imageKey", d."sortOrder", d."createdAt", d."updatedAt"
    FROM "Dish" d
    JOIN "Venue" v ON v.id = d."venueId"
`;

function toAdminRow(r: DishJoinRow) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    price: r.price,
    available: r.available,
    venueId: r.venueId,
    venueName: r.venueName,
    imageKey: r.imageKey,
    sortOrder: r.sortOrder,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

/** Todos los platillos (disponibles y no), para /admin/menu. */
export async function listDishesAdmin() {
  const { rows } = await query<DishJoinRow>(`${DISH_SELECT} ORDER BY v."sortOrder", d."sortOrder", d.name`);
  return rows.map(toAdminRow);
}

/** Solo los DISPONIBLES, con la imagen ya resuelta a URL -- para el consumo público (menú/carrusel). */
export async function listMenuPublic() {
  const { rows } = await query<DishJoinRow>(
    `${DISH_SELECT} WHERE d.available = true ORDER BY v."sortOrder", d."sortOrder", d.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    price: r.price,
    venueId: r.venueId,
    venueName: r.venueName,
    imageUrl: r.imageKey ? `/api/dish-image/${encodeURIComponent(r.imageKey)}` : null,
  }));
}

async function getDishRow(id: string): Promise<DishJoinRow | null> {
  const { rows } = await query<DishJoinRow>(`${DISH_SELECT} WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getDishAdmin(id: string) {
  const row = await getDishRow(id);
  return row ? toAdminRow(row) : null;
}

type ParsedDishForm = {
  name: string;
  description: string;
  price: number;
  available: boolean;
  venueId: string;
};

function parseDishForm(form: FormData): ParsedDishForm {
  const name = String(form.get('name') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const priceRaw = String(form.get('price') ?? '').trim();
  const price = Math.round(Number(priceRaw));
  const available = String(form.get('available') ?? 'true') === 'true';
  const venueId = String(form.get('venueId') ?? '').trim();

  if (!name) throw new DishValidationError('Escribe el nombre del platillo.');
  if (name.length > 80) throw new DishValidationError('El nombre es demasiado largo (máximo 80 caracteres).');
  if (!description) throw new DishValidationError('Escribe una descripción.');
  if (description.length > 500) throw new DishValidationError('La descripción es demasiado larga (máximo 500 caracteres).');
  if (!Number.isFinite(price) || Number.isNaN(price) || price < 0) {
    throw new DishValidationError('El precio no es válido.');
  }
  if (!venueId) throw new DishValidationError('Elige una sede.');

  return { name, description, price, available, venueId };
}

async function assertVenueExists(venueId: string) {
  const { rows } = await query<{ id: string }>(`SELECT id FROM "Venue" WHERE id = $1`, [venueId]);
  if (!rows[0]) throw new DishValidationError('Esa sede no existe.');
}

/** Si el form trae un archivo "image" válido, lo sube a Blobs y regresa su key. Si no, regresa undefined (sin cambio de foto). */
async function saveImageIfPresent(form: FormData, dishId: string): Promise<string | undefined> {
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return undefined;

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) throw new DishValidationError('La imagen debe ser JPG, PNG o WebP.');
  if (file.size > MAX_IMAGE_BYTES) throw new DishValidationError('La imagen no puede pesar más de 4 MB.');

  // Key única por subida (nunca se reusa, ni siquiera al reemplazar) para no
  // servir una versión vieja cacheada bajo la misma key.
  const key = `${dishId}-${Date.now()}.${ext}`;
  await imageStore().set(key, file, { metadata: { contentType: file.type } });
  return key;
}

/**
 * Resuelve qué imagen usar al crear/editar, en este orden de prioridad:
 *   1. Un archivo "image" subido a mano -> se sube a Blobs (saveImageIfPresent).
 *   2. Una key "useImageKey" -- viene de la búsqueda automática (ver
 *      autoFetchDishImage): esa foto YA está en Blobs, solo hay que
 *      confirmar que de verdad existe (el cliente no puede inventar una key
 *      y hacer que el platillo apunte a algo que no está ahí).
 *   3. Nada -- sin cambio de imagen.
 * Regresa undefined cuando no hay cambio, igual que saveImageIfPresent.
 */
async function resolveDishImage(form: FormData, dishId: string): Promise<string | undefined> {
  const uploaded = await saveImageIfPresent(form, dishId);
  if (uploaded) return uploaded;

  const useKey = String(form.get('useImageKey') ?? '').trim();
  if (!useKey) return undefined;

  const exists = await imageStore().getMetadata(useKey).catch(() => null);
  if (!exists) throw new DishValidationError('Esa foto encontrada automáticamente ya expiró, busca de nuevo.');
  return useKey;
}

export async function createDish(form: FormData) {
  const data = parseDishForm(form);
  await assertVenueExists(data.venueId);

  const id = newId();
  const imageKey = (await resolveDishImage(form, id)) ?? null;

  const { rows: maxRows } = await query<{ max: number | null }>(
    `SELECT MAX("sortOrder") AS max FROM "Dish" WHERE "venueId" = $1`,
    [data.venueId],
  );
  const sortOrder = (maxRows[0]?.max ?? -1) + 1;

  await query(
    `INSERT INTO "Dish" (id, name, description, price, available, "venueId", "imageKey", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${NOW_UTC}, ${NOW_UTC})`,
    [id, data.name, data.description, data.price, data.available, data.venueId, imageKey, sortOrder],
  );

  return getDishAdmin(id);
}

export async function updateDish(id: string, form: FormData) {
  const existing = await getDishRow(id);
  if (!existing) throw new DishValidationError('Ese platillo ya no existe.');

  const data = parseDishForm(form);
  await assertVenueExists(data.venueId);

  // Sube la foto nueva ANTES de tocar la fila -- si falla la subida, la fila
  // ni se entera y el platillo se queda con su imagen anterior intacta.
  const newImageKey = await resolveDishImage(form, id);
  const finalImageKey = newImageKey ?? existing.imageKey;

  await query(
    `UPDATE "Dish"
        SET name = $2, description = $3, price = $4, available = $5,
            "venueId" = $6, "imageKey" = $7, "updatedAt" = ${NOW_UTC}
      WHERE id = $1`,
    [id, data.name, data.description, data.price, data.available, data.venueId, finalImageKey],
  );

  // Solo ahora, con la fila ya apuntando a la key nueva, se borra la vieja.
  // Si este delete falla, queda un blob huérfano inofensivo (nada lo
  // referencia) en vez de un platillo roto -- por eso no se propaga el error.
  if (newImageKey && existing.imageKey && existing.imageKey !== newImageKey) {
    await imageStore()
      .delete(existing.imageKey)
      .catch((err) => console.error('[dishes] no se pudo borrar la imagen vieja', existing.imageKey, err));
  }

  return getDishAdmin(id);
}

export async function deleteDish(id: string) {
  const existing = await getDishRow(id);
  if (!existing) throw new DishValidationError('Ese platillo ya no existe.');

  await query(`DELETE FROM "Dish" WHERE id = $1`, [id]);

  if (existing.imageKey) {
    await imageStore()
      .delete(existing.imageKey)
      .catch((err) => console.error('[dishes] no se pudo borrar la imagen al eliminar', existing.imageKey, err));
  }
}

/** Para la función pública que sirve el archivo (GET /api/dish-image/:key). */
export async function getDishImage(key: string): Promise<{ blob: Blob; contentType: string } | null> {
  const store = imageStore();
  const blob = await store.get(key, { type: 'blob' });
  if (!blob) return null;
  const meta = await store.getMetadata(key).catch(() => null);
  const contentType = (meta?.metadata?.contentType as string | undefined) ?? 'application/octet-stream';
  return { blob, contentType };
}

/**
 * Busca una foto automáticamente (Openverse, cualquier licencia -- uso
 * interno, ver server/openverseSearch.ts) y, si encuentra una, la guarda YA en Blobs bajo
 * una key "auto-...", lista para usarse. Esto es solo una VISTA PREVIA: el
 * platillo no se toca todavía -- /admin/menu manda esa key como
 * "useImageKey" cuando el admin de verdad guarda el formulario (ver
 * resolveDishImage). Si el admin nunca la usa (sube otra a mano, o cancela),
 * la key queda huérfana en Blobs -- un archivo de pocos KB sin referencia,
 * se acepta como costo menor en vez de construir un endpoint de descarte
 * aparte.
 *
 * `excludeIds` -- ids de Openverse (sourceId) que NO se deben volver a
 * ofrecer: así es como "Buscar otra" en /admin/menu consigue una foto
 * DISTINTA a la(s) que el admin ya vio y descartó, en vez de recibir la
 * misma primera foto una y otra vez (ver openverseSearch.ts).
 */
export async function autoFetchDishImage(rawQuery: string, excludeIds: string[] = []) {
  const query = rawQuery.trim();
  if (!query) throw new DishValidationError('Escribe un término de búsqueda.');
  if (query.length > 120) throw new DishValidationError('El término de búsqueda es demasiado largo.');

  const found = await searchOpenverseImage(query, excludeIds);
  if (!found) return null;

  const key = `auto-${newId()}.${found.ext}`;
  await imageStore().set(key, found.bytes, { metadata: { contentType: found.contentType } });

  return {
    imageKey: key,
    previewUrl: `/api/dish-image/${encodeURIComponent(key)}`,
    title: found.title,
    creator: found.creator,
    license: found.license,
    sourceUrl: found.sourceUrl,
    sourceId: found.sourceId,
  };
}

// Lógica pura (sin red ni base) de la conciliación de fotos de perfil: se prueba por separado.
// Una llave de foto la genera server/profile.ts: `<attendeeId>-<18 hex>.jpg`.
export const PHOTO_KEY_RE = /^[A-Za-z0-9_-]{1,64}-[0-9a-f]{18}\.jpg$/;
/** Margen para no tocar una subida en curso: el archivo se sube ANTES de actualizar la fila. */
export const MIN_AGE_MS = 60 * 60 * 1000;

/**
 * @param {{key: string, createdAt?: string|null}[]} blobs   archivos que hay en el almacén (createdAt = metadata, si la tiene)
 * @param {Iterable<string>} referenced                      llaves que apuntan las filas de AttendeeProfile
 * @param {number} [now]
 * @returns {{orphans: string[], tooRecent: string[], foreign: string[], missing: string[]}}
 *   orphans   = están en el almacén, ninguna fila las apunta y tienen más de 1 h (o no traen fecha: son anteriores a este control)
 *   tooRecent = sin fila pero de hace menos de 1 h (puede haber una subida en curso: no se tocan)
 *   foreign   = llaves que no tienen el formato de este módulo (nunca se tocan)
 *   missing   = filas que apuntan a un archivo que no existe (referencia rota; solo se informa)
 */
export function classifyPhotos(blobs, referenced, now = Date.now()) {
  const ref = new Set(referenced);
  const inStore = new Set(blobs.map((b) => b.key));
  const orphans = [];
  const tooRecent = [];
  const foreign = [];
  for (const b of blobs) {
    if (!PHOTO_KEY_RE.test(b.key)) {
      foreign.push(b.key);
      continue;
    }
    if (ref.has(b.key)) continue;
    const t = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (Number.isFinite(t) && now - t < MIN_AGE_MS) tooRecent.push(b.key);
    else orphans.push(b.key);
  }
  const missing = [...ref].filter((k) => !inStore.has(k));
  return { orphans, tooRecent, foreign, missing };
}

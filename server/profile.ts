import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import type pg from 'pg';
import { NOW_UTC, query } from './db';
import { writeAudit } from './audit';
import {
  PROFILES_BATCH_MAX,
  PROFILE_KINDS,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_SIDE,
  PROFILE_PHOTO_MIN_SIDE,
  isAvatarId,
  parseInitialsStyle,
  type AttendeeProfileView,
  type ProfileKind,
} from '../shared/profile';
import { QR_TOKEN_RE } from '../shared/api';

/**
 * Perfil del asistente (7 oct 2026): foto / avatar de la galería / iniciales.
 *
 * - Tabla "AttendeeProfile" (migración 009). Si todavía no existe, TODO degrada a "como antes":
 *   leer devuelve "sin perfil" y guardar responde que aún no está disponible.
 * - La FOTO vive en Netlify Blobs (store "profile-photos"), NUNCA en Postgres ni en localStorage.
 *   Es PRIVADA: no hay URL pública. Se entrega con una URL firmada (HMAC con SESSION_SECRET,
 *   dominio de firma propio) que caduca en 24-48 h, y solo a asistentes con sesión activa o staff.
 * - Quién puede cambiar qué: el asistente se identifica SIEMPRE por el token de su pulsera
 *   (nunca por un id que mande el cliente), así que solo puede tocar su propia fila. Quitar la foto
 *   de otra persona es solo para ADMIN (moderación).
 * - Fotos: solo JPEG (se verifican los bytes, no la extensión ni el tipo que declare el cliente),
 *   máx. 1 MB y 64-2048 px por lado. Se les quitan los metadatos (EXIF/GPS/miniaturas) en el servidor y
 *   se descarta todo lo que venga después del fin de imagen (EOI); un JPEG sin EOI o con dos SOF se rechaza.
 * - Límite de frecuencia (sin tablas nuevas): se compara "updatedAt" de la propia fila. Subir una foto exige
 *   10 s desde el último cambio; cualquier otro guardado, 2 s. Si no, 429 con Retry-After. La comprobación se
 *   repite de forma atómica dentro del UPSERT, así que dos peticiones simultáneas no la saltan.
 * - Limpieza: cuando se borra a un asistente (desvincular pulsera, borrar lote) su foto se borra de Blobs
 *   DESPUÉS de confirmar la base. Si ese borrado falla queda un archivo huérfano (inaccesible, sin fila) y se
 *   registra `[profile:huerfana]` en el log; `npm run db:fotos-huerfanas` lo detecta y lo limpia (ver docs).
 */

export class ProfileError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 429 | 503 = 400,
    /** Segundos que debe esperar el cliente (solo 429; va en la cabecera Retry-After). */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** Espera mínima (s) entre cambios de la misma persona. Subir foto cuesta más (archivo nuevo en Blobs). */
const COOLDOWN = { photoSec: 10, otherSec: 2 };
/** SOLO pruebas. */
export function setProfileCooldownForTests(c: { photoSec: number; otherSec: number } | null) {
  COOLDOWN.photoSec = c?.photoSec ?? 10;
  COOLDOWN.otherSec = c?.otherSec ?? 2;
}

const PHOTO_STORE = 'profile-photos';
const SIGN_DOMAIN = 'profile-photo-v1';
const DAY_S = 86_400;

/* ------------------------------------------------------------------ */
/* Almacenamiento (reemplazable en pruebas)                            */
/* ------------------------------------------------------------------ */

export type PhotoStore = {
  set(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
};

const netlifyStore = (): PhotoStore => {
  // consistency 'strong': al cambiar de foto, la nueva debe estar disponible de inmediato.
  const s = () => getStore({ name: PHOTO_STORE, consistency: 'strong' });
  return {
    async set(key, data, contentType) {
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      await s().set(key, ab, { metadata: { contentType, createdAt: new Date().toISOString() } });
    },
    async get(key) {
      const r = await s().getWithMetadata(key, { type: 'arrayBuffer' });
      if (!r) return null;
      return { data: r.data as ArrayBuffer, contentType: String(r.metadata?.contentType ?? 'image/jpeg') };
    },
    async delete(key) {
      await s().delete(key);
    },
  };
};

let store: PhotoStore | null = null;
const photos = () => (store ??= netlifyStore());
/** SOLO pruebas: cambia el almacenamiento por uno en memoria. */
export function setPhotoStoreForTests(s: PhotoStore | null) {
  store = s;
}

/* ------------------------------------------------------------------ */
/* URLs firmadas                                                       */
/* ------------------------------------------------------------------ */

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('Falta SESSION_SECRET en el archivo .env de arraigados-app (ver .env.example).');
  return s;
}
const mac = (key: string, exp: number) => createHmac('sha256', secret()).update(`${SIGN_DOMAIN}|${key}|${exp}`).digest('base64url');

/** La caducidad se redondea al día para que la URL no cambie en cada consulta (así el navegador la cachea). */
export function signedPhotoUrl(key: string, now = Date.now()): string {
  const exp = (Math.floor(now / 1000 / DAY_S) + 2) * DAY_S; // 24-48 h
  return `/api/profile-photo/${encodeURIComponent(key)}?e=${exp}&s=${mac(key, exp)}`;
}

export function verifyPhotoSignature(key: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  const e = Number(exp);
  if (!key || !sig || !Number.isInteger(e) || e * 1000 < now) return false;
  const given = Buffer.from(sig, 'base64url');
  const expected = Buffer.from(mac(key, e), 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function readPhoto(key: string) {
  return photos().get(key);
}

/* ------------------------------------------------------------------ */
/* JPEG: verificación y limpieza de metadatos                          */
/* ------------------------------------------------------------------ */

/**
 * Verifica que sean bytes de un JPEG real y devuelve una copia SIN metadatos (APPn: EXIF/GPS/ICC/miniatura,
 * y comentarios) y SIN nada después del fin de imagen. Sin dependencias: recorre los segmentos del archivo.
 * Soporta JPEG base y progresivo (varios escaneos, marcadores de reinicio). null = no es un JPEG válido:
 * sin SOI/EOI, con dos SOF (los navegadores también lo rechazan), con segmentos truncados o sin escaneo.
 */
export function cleanJpeg(buf: Buffer): { data: Buffer; width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  let width = 0;
  let height = 0;
  let scans = 0;
  let ended = false;
  while (i + 2 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    if (marker === 0xff) {
      i += 1; // byte de relleno
      continue;
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      ended = true; // EOI: lo que siga (datos pegados al final) se descarta
      break;
    }
    if (marker === 0x00 || marker === 0xd8) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) return null;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    const segEnd = i + 2 + len;
    if (marker === 0xda) {
      if (!width) return null; // escaneo antes del encabezado de imagen
      // Datos comprimidos: hasta el siguiente marcador real (0xFF00 = byte escapado, 0xFFD0-D7 = reinicio).
      let j = segEnd;
      while (j < buf.length) {
        if (buf[j] === 0xff) {
          const nx = buf[j + 1];
          if (nx === undefined) return null;
          if (nx === 0x00 || (nx >= 0xd0 && nx <= 0xd7)) {
            j += 2;
            continue;
          }
          if (nx === 0xff) {
            j += 1;
            continue;
          }
          break;
        }
        j += 1;
      }
      if (j >= buf.length) return null; // sin EOI
      out.push(buf.subarray(i, j));
      scans += 1;
      i = j;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (width || len < 8) return null; // un segundo SOF o uno truncado
      height = buf.readUInt16BE(i + 5);
      width = buf.readUInt16BE(i + 7);
      out.push(buf.subarray(i, segEnd));
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      // APPn / comentario: se descarta.
    } else {
      out.push(buf.subarray(i, segEnd));
    }
    i = segEnd;
  }
  if (!ended || !scans || !width || !height) return null;
  return { data: Buffer.concat(out), width, height };
}

/* ------------------------------------------------------------------ */
/* Base de datos                                                       */
/* ------------------------------------------------------------------ */

const isMissingSchema = (err: unknown) => ['42P01', '42703'].includes((err as { code?: string })?.code ?? '');

type ProfileRow = { attendeeId: string; kind: ProfileKind; avatarId: string | null; initialsId: string | null; photoKey: string | null };
/** `ageSec` = segundos desde el último cambio (calculado en la base, en UTC, para no depender del reloj ni la zona del servidor). */
type ProfileRowAge = ProfileRow & { ageSec: number };
const COLS = '"attendeeId", "kind", "avatarId", "initialsId", "photoKey"';

/**
 * Para usar DENTRO de la transacción que borra asistentes: las llaves de sus fotos, leídas ANTES del DELETE
 * (la fila de perfil se borra en cascada y después ya no habría de dónde sacarlas). [] si la tabla no existe.
 * El archivo se borra con `deletePhotoFiles` una vez confirmada la transacción.
 */
export async function photoKeysForAttendees(tx: pg.PoolClient, attendeeIds: string[]): Promise<string[]> {
  if (!attendeeIds.length) return [];
  const has = (await tx.query(`SELECT to_regclass('public."AttendeeProfile"') AS t`)).rows[0]?.t;
  if (!has) return [];
  const { rows } = await tx.query<{ photoKey: string }>(
    `SELECT "photoKey" FROM "AttendeeProfile" WHERE "attendeeId" = ANY($1::text[]) AND "photoKey" IS NOT NULL`,
    [attendeeIds],
  );
  return rows.map((r) => r.photoKey);
}

/**
 * Borra archivos de foto DESPUÉS de confirmar la base. Nunca lanza: si Blobs falla, la operación del usuario ya
 * se completó y el archivo queda huérfano (sin fila que lo apunte y con URL firmada que caduca en 24-48 h).
 * Cada fallo se registra como `[profile:huerfana] key=<llave>` para poder reintentarlo (db:fotos-huerfanas).
 */
export async function deletePhotoFiles(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await photos().delete(key);
    } catch (err) {
      console.error(`[profile:huerfana] key=${key} no se pudo borrar de Blobs:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * `full` = la propia persona: ve TODAS sus selecciones (también las inactivas, para poder volver a ellas).
 * Para cualquier otra persona solo sale lo ACTIVO: una foto inactiva no se firma ni se entrega a nadie más.
 */
const toView = (r: ProfileRow, full = true): AttendeeProfileView => ({
  kind: r.kind,
  avatarId: full || r.kind === 'avatar' ? r.avatarId : null,
  initialsId: full || r.kind === 'initials' ? r.initialsId : null,
  photoUrl: r.photoKey && (full || r.kind === 'photo') ? signedPhotoUrl(r.photoKey) : null,
});

/** Perfil de un asistente (o null si aún no eligió nada / la migración 009 no está aplicada). */
export async function getProfile(attendeeId: string): Promise<AttendeeProfileView | null> {
  try {
    const { rows } = await query<ProfileRow>(`SELECT ${COLS} FROM "AttendeeProfile" WHERE "attendeeId" = $1`, [attendeeId]);
    return rows[0] ? toView(rows[0]) : null;
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

/** Perfiles de varias personas a la vez (notas, likes, listas del panel). Solo aparecen quienes personalizaron. */
export async function getProfiles(ids: unknown, selfId?: string | null): Promise<Record<string, AttendeeProfileView>> {
  if (!Array.isArray(ids)) throw new ProfileError('Solicitud inválida.');
  const clean = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))].slice(0, PROFILES_BATCH_MAX);
  if (!clean.length) return {};
  try {
    const { rows } = await query<ProfileRow>(
      `SELECT ${COLS} FROM "AttendeeProfile" WHERE "attendeeId" = ANY($1::text[])`,
      [clean],
    );
    return Object.fromEntries(rows.map((r) => [r.attendeeId, toView(r, r.attendeeId === selfId)]));
  } catch (err) {
    if (isMissingSchema(err)) return {};
    throw err;
  }
}

const tooFast = (sec: number) => {
  const wait = Math.max(1, Math.ceil(sec));
  return new ProfileError(`Hiciste un cambio hace un momento. Espera ${wait} s e inténtalo de nuevo.`, 429, wait);
};

/** El asistente con sesión activa dueño de este token (o null). Nunca se confía en un id del cliente. */
export async function attendeeIdForToken(token: string): Promise<string | null> {
  if (!QR_TOKEN_RE.test(token)) return null;
  const { rows } = await query<{ attendeeId: string | null }>(`SELECT "attendeeId" FROM "Pulse" WHERE "qrToken" = $1 AND status = 'ACTIVE'`, [token]);
  return rows[0]?.attendeeId ?? null;
}

const bestEffortDelete = async (key: string | null | undefined) => {
  if (key) await deletePhotoFiles([key]);
};

/**
 * Guarda la elección del asistente (multipart). Las TRES selecciones se conservan; `kind` marca la activa.
 *   kind        'photo' | 'avatar' | 'initials'  (obligatorio: qué queda ACTIVO)
 *   avatarId    el avatar (galería / `c.…`); si no viene, se conserva el que ya tenía
 *   initialsId  estilo de iniciales; vacío = las de siempre; si no viene, se conserva el que ya tenía
 *   photo       foto nueva (JPEG). Reemplaza a la anterior. Sin archivo, se conserva la que ya tenía
 *   removePhoto '1' = eliminar la foto guardada (única forma, junto con subir otra, de que se borre)
 * Orden pensado para no dejar referencias rotas: primero se sube la foto nueva, luego se actualiza la fila
 * y SOLO si eso salió bien se borra la foto anterior (y si la fila falla, se borra la nueva).
 * Si algo falla, lo que ya estaba guardado queda intacto.
 */
export async function saveProfile(attendeeId: string, form: FormData): Promise<AttendeeProfileView> {
  const kindRaw = String(form.get('kind') ?? '');
  if (!PROFILE_KINDS.includes(kindRaw as ProfileKind)) throw new ProfileError('Elige Foto, Avatar o Iniciales.');
  const kind = kindRaw as ProfileKind;
  const removePhoto = form.get('removePhoto') === '1';

  const file = form.get('photo');
  const uploading = file instanceof File && file.size > 0;
  const windowSec = uploading ? COOLDOWN.photoSec : COOLDOWN.otherSec;

  let prev: ProfileRowAge | undefined;
  try {
    prev = (
      await query<ProfileRowAge>(
        `SELECT ${COLS}, EXTRACT(EPOCH FROM (${NOW_UTC} - "updatedAt"))::float8 AS "ageSec" FROM "AttendeeProfile" WHERE "attendeeId" = $1`,
        [attendeeId],
      )
    ).rows[0];
  } catch (err) {
    if (isMissingSchema(err)) throw new ProfileError('Esta función todavía no está disponible. Inténtalo más tarde.', 503);
    throw err;
  }

  // Límite de frecuencia (primera comprobación, barata: aún no se lee ni se sube nada).
  if (prev && prev.ageSec < windowSec) throw tooFast(windowSec - prev.ageSec);

  let avatarId = prev?.avatarId ?? null;
  let initialsId = prev?.initialsId ?? null;
  let photoKey = prev?.photoKey ?? null;
  let uploadedKey: string | null = null;

  // Cada selección se actualiza si viene en la petición (aunque no sea la activa); si no viene, se conserva.
  if (form.has('avatarId')) {
    const id = String(form.get('avatarId') ?? '');
    if (!isAvatarId(id)) throw new ProfileError('Ese avatar no existe.');
    avatarId = id;
  }
  if (form.has('initialsId')) {
    // Vacío = las iniciales de siempre. Con estilo: posiciones de palabras + color (validado, ver shared/profile.ts).
    const id = String(form.get('initialsId') ?? '');
    if (id && !parseInitialsStyle(id)) throw new ProfileError('Esas iniciales no son válidas.');
    initialsId = id || null;
  }
  if (kind === 'avatar' && !avatarId) throw new ProfileError('Elige un avatar para continuar.');

  if (uploading) {
    if ((file as File).size > PROFILE_PHOTO_MAX_BYTES) throw new ProfileError('La foto pesa demasiado. Elige una más ligera.');
    const cleaned = cleanJpeg(Buffer.from(await (file as File).arrayBuffer()));
    if (!cleaned) throw new ProfileError('No pudimos leer esa foto. Prueba con otra imagen (JPG).');
    if (cleaned.width < PROFILE_PHOTO_MIN_SIDE || cleaned.height < PROFILE_PHOTO_MIN_SIDE) throw new ProfileError('La foto es demasiado pequeña.');
    if (cleaned.width > PROFILE_PHOTO_MAX_SIDE || cleaned.height > PROFILE_PHOTO_MAX_SIDE) throw new ProfileError('La foto es demasiado grande.');
    uploadedKey = `${attendeeId}-${randomBytes(9).toString('hex')}.jpg`; // llave nueva en cada subida: nunca se sirve una versión vieja
    await photos().set(uploadedKey, cleaned.data, 'image/jpeg');
    photoKey = uploadedKey; // reemplaza a la anterior (que se borra abajo, ya con la fila actualizada)
  } else if (removePhoto) {
    photoKey = null;
  }
  if (kind === 'photo' && !photoKey) {
    throw new ProfileError(removePhoto ? 'Elige otra opción para usar en lugar de la foto.' : 'Elige una foto para continuar.');
  }

  let written = true;
  try {
    // La cláusula WHERE repite el límite de frecuencia de forma atómica: si otra petición cambió la fila hace
    // menos de `windowSec` (dos dispositivos a la vez, o reintentos en ráfaga), esta no escribe nada (0 filas).
    const r = await query(
      `INSERT INTO "AttendeeProfile" ("attendeeId", "kind", "avatarId", "initialsId", "photoKey", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, ${NOW_UTC})
       ON CONFLICT ("attendeeId") DO UPDATE SET "kind" = EXCLUDED."kind", "avatarId" = EXCLUDED."avatarId",
                                                "initialsId" = EXCLUDED."initialsId", "photoKey" = EXCLUDED."photoKey",
                                                "updatedAt" = EXCLUDED."updatedAt"
         WHERE "AttendeeProfile"."updatedAt" <= ${NOW_UTC} - make_interval(secs => $6::double precision)`,
      [attendeeId, kind, avatarId, initialsId, photoKey, windowSec],
    );
    written = (r.rowCount ?? 0) > 0;
  } catch (err) {
    await bestEffortDelete(uploadedKey); // la fila no cambió: no dejar la foto nueva huérfana
    if (isMissingSchema(err)) throw new ProfileError('Esta función todavía no está disponible. Inténtalo más tarde.', 503);
    throw err;
  }

  if (!written) {
    await bestEffortDelete(uploadedKey); // otra petición ganó: no dejar la foto nueva huérfana
    throw tooFast(windowSec);
  }

  if (prev?.photoKey && prev.photoKey !== photoKey) await bestEffortDelete(prev.photoKey); // la anterior ya no la referencia nadie
  return toView({ attendeeId, kind, avatarId, initialsId, photoKey });
}

/** Moderación (solo ADMIN): quita la foto de un asistente (si la tenía activa, queda en iniciales; su avatar e iniciales guardados se conservan). */
export async function removePhotoAsAdmin(actorId: string, attendeeId: string): Promise<void> {
  let row: (ProfileRow & { fullName: string | null }) | undefined;
  try {
    row = (
      await query<ProfileRow & { fullName: string | null }>(
        `SELECT p."attendeeId", p."kind", p."avatarId", p."initialsId", p."photoKey", a."fullName"
           FROM "AttendeeProfile" p LEFT JOIN "Attendee" a ON a.id = p."attendeeId" WHERE p."attendeeId" = $1`,
        [attendeeId],
      )
    ).rows[0];
  } catch (err) {
    if (isMissingSchema(err)) throw new ProfileError('Esa persona no tiene foto de perfil.', 404);
    throw err;
  }
  if (!row?.photoKey) throw new ProfileError('Esa persona no tiene foto de perfil.', 404);
  await query(`UPDATE "AttendeeProfile" SET "kind" = CASE WHEN "kind" = 'photo' THEN 'initials' ELSE "kind" END, "photoKey" = NULL, "updatedAt" = ${NOW_UTC} WHERE "attendeeId" = $1`, [attendeeId]);
  await bestEffortDelete(row.photoKey);
  await writeAudit(actorId, 'attendee.photo_remove', 'Attendee', attendeeId, { attendee: row.fullName ?? '' });
}

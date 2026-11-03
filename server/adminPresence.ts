import { NOW_UTC, newId, query } from './db';
import type { AdminPresenceResponse, StaffUser } from '../shared/api';

/**
 * «En línea» y mensajes entre cuentas Admin (migración 020).
 *
 * - El panel de Admin manda un «latido» cada ~15 s mientras está abierto y visible (POST /api/admin/presence { path }).
 *   Se guarda UNA fila por cuenta (upsert): sección y hora. «En línea» = latido hace menos de ONLINE_SEC.
 * - La misma respuesta trae quién está en línea y los mensajes sin leer de quien pregunta (así no hace falta otra consulta).
 * - Mensajes: solo entre cuentas Admin activas, nunca a uno mismo, 1–300 caracteres. Se marcan leídos al cerrarlos.
 * - Sin la migración 020 (tablas inexistentes) el latido responde { available: false } y la esquina no se muestra.
 * La autorización (solo ADMIN) la hace cada función con authorize(); aquí se recibe el usuario ya verificado.
 */
export const ONLINE_SEC = 45;
export const MESSAGE_MAX = 300;

export class PresenceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const isMissingTable = (err: unknown) => (err as { code?: string })?.code === '42P01';
const ISO = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Solo la ruta del panel (sin dominio, consulta ni ancla). Cualquier otra cosa se guarda como '/admin'. */
export function cleanPath(v: unknown): string {
  const raw = typeof v === 'string' ? v.split(/[?#]/)[0] : '';
  return /^\/admin(\/[A-Za-z0-9_\-/]*)?$/.test(raw) && raw.length <= 200 ? raw : '/admin';
}

async function snapshot(me: StaffUser): Promise<AdminPresenceResponse> {
  const online = (await query<AdminPresenceResponse['online'][number]>(
    `SELECT u.id AS "userId", u.name, p."path", ${ISO('p."lastSeen"')} AS "lastSeen",
            GREATEST(0, EXTRACT(EPOCH FROM (${NOW_UTC} - p."lastSeen")))::int AS "secondsAgo",
            (u.id = $1) AS me
       FROM "AdminPresence" p JOIN "User" u ON u.id = p."userId"
      WHERE u.active AND u.role = 'ADMIN' AND p."lastSeen" > ${NOW_UTC} - make_interval(secs => $2)
      ORDER BY (u.id = $1) DESC, lower(u.name)`,
    [me.id, ONLINE_SEC],
  )).rows;
  const inbox = (await query<AdminPresenceResponse['inbox'][number]>(
    `SELECT id, "fromUserId", "fromName", body, ${ISO('"createdAt"')} AS "createdAt"
       FROM "AdminMessage" WHERE "toUserId" = $1 AND "readAt" IS NULL
      ORDER BY "createdAt", id LIMIT 20`,
    [me.id],
  )).rows;
  return { available: true, onlineSec: ONLINE_SEC, online, inbox };
}

/** POST /api/admin/presence: registra el latido y devuelve quién está en línea + mis mensajes sin leer. */
export async function heartbeat(me: StaffUser, path: unknown): Promise<AdminPresenceResponse> {
  try {
    await query(
      `INSERT INTO "AdminPresence" ("userId", "path", "lastSeen") VALUES ($1, $2, ${NOW_UTC})
       ON CONFLICT ("userId") DO UPDATE SET "path" = EXCLUDED."path", "lastSeen" = EXCLUDED."lastSeen"`,
      [me.id, cleanPath(path)],
    );
    return await snapshot(me);
  } catch (err) {
    if (isMissingTable(err)) return { available: false, onlineSec: ONLINE_SEC, online: [], inbox: [] };
    throw err;
  }
}

/** POST /api/admin/messages { toUserId, body }: manda un mensaje corto a otra cuenta Admin activa. */
export async function sendMessage(me: StaffUser, input: { toUserId?: unknown; body?: unknown }): Promise<{ ok: true }> {
  const to = typeof input.toUserId === 'string' ? input.toUserId : '';
  const body = typeof input.body === 'string' ? input.body.replace(/\s+/g, ' ').trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(to)) throw new PresenceError('Elige a quién mandarle el mensaje.');
  if (to === me.id) throw new PresenceError('No puedes mandarte un mensaje a ti mismo.');
  if (!body) throw new PresenceError('Escribe el mensaje.');
  if ([...body].length > MESSAGE_MAX) throw new PresenceError(`El mensaje es muy largo (máximo ${MESSAGE_MAX} caracteres).`);
  const target = (await query<{ id: string }>(`SELECT id FROM "User" WHERE id = $1 AND active AND role = 'ADMIN'`, [to])).rows[0];
  if (!target) throw new PresenceError('Esa cuenta no existe o no es Admin.', 404);
  try {
    await query(
      `INSERT INTO "AdminMessage" (id, "fromUserId", "fromName", "toUserId", body, "createdAt") VALUES ($1, $2, $3, $4, $5, ${NOW_UTC})`,
      [newId(), me.id, me.name, to, body],
    );
  } catch (err) {
    if (isMissingTable(err)) throw new PresenceError('Los mensajes aún no están habilitados en esta base (falta la migración 020).', 409);
    throw err;
  }
  return { ok: true };
}

/** POST /api/admin/messages/read { ids }: marca como leídos MIS mensajes (los de otros no se tocan). */
export async function markRead(me: StaffUser, ids: unknown): Promise<{ read: number }> {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, 50) : [];
  if (list.length === 0) return { read: 0 };
  try {
    const r = await query(
      `UPDATE "AdminMessage" SET "readAt" = ${NOW_UTC} WHERE "toUserId" = $1 AND id = ANY($2::text[]) AND "readAt" IS NULL`,
      [me.id, list],
    );
    return { read: r.rowCount ?? 0 };
  } catch (err) {
    if (isMissingTable(err)) return { read: 0 };
    throw err;
  }
}

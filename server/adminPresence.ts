import { NOW_UTC, newId, query } from './db';
import type { AdminChatMessage, AdminConversation, AdminPresenceResponse, AdminThreadResponse, StaffUser } from '../shared/api';

/**
 * «En línea» y mensajes entre cuentas Admin (migración 020).
 *
 * - El panel de Admin manda un «latido» cada ~15 s mientras está abierto y visible (POST /api/admin/presence { path }).
 *   Se guarda UNA fila por cuenta (upsert): sección y hora. «En línea» = latido hace menos de ONLINE_SEC.
 * - La misma respuesta trae quién está en línea y los mensajes sin leer de quien pregunta (así no hace falta otra consulta).
 * - Mensajes: solo entre cuentas Admin activas, nunca a uno mismo, 1–300 caracteres. Se marcan leídos al cerrarlos o al
 *   abrir la conversación con esa persona (historial tipo chat: listConversations / getThread).
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
export async function sendMessage(me: StaffUser, input: { toUserId?: unknown; body?: unknown }): Promise<{ ok: true; message: AdminChatMessage }> {
  const to = typeof input.toUserId === 'string' ? input.toUserId : '';
  const body = typeof input.body === 'string' ? input.body.replace(/\s+/g, ' ').trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(to)) throw new PresenceError('Elige a quién mandarle el mensaje.');
  if (to === me.id) throw new PresenceError('No puedes mandarte un mensaje a ti mismo.');
  if (!body) throw new PresenceError('Escribe el mensaje.');
  if ([...body].length > MESSAGE_MAX) throw new PresenceError(`El mensaje es muy largo (máximo ${MESSAGE_MAX} caracteres).`);
  const target = (await query<{ id: string }>(`SELECT id FROM "User" WHERE id = $1 AND active AND role = 'ADMIN'`, [to])).rows[0];
  if (!target) throw new PresenceError('Esa cuenta no existe o no es Admin.', 404);
  try {
    const message = (await query<AdminChatMessage>(
      `INSERT INTO "AdminMessage" (id, "fromUserId", "fromName", "toUserId", body, "createdAt") VALUES ($1, $2, $3, $4, $5, ${NOW_UTC})
       RETURNING id, true AS "fromMe", body, ${ISO('"createdAt"')} AS "createdAt", NULL::text AS "readAt"`,
      [newId(), me.id, me.name, to, body],
    )).rows[0];
    return { ok: true, message };
  } catch (err) {
    if (isMissingTable(err)) throw new PresenceError('Los mensajes aún no están habilitados en esta base (falta la migración 020).', 409);
    throw err;
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const THREAD_PAGE = 60;

/** GET /api/admin/messages: mis conversaciones (una por persona, la más reciente primero) con el último mensaje y los no leídos. */
export async function listConversations(me: StaffUser): Promise<{ available: boolean; conversations: AdminConversation[] }> {
  try {
    const rows = (await query<AdminConversation>(
      `WITH m AS (
         SELECT id, body, "createdAt",
                CASE WHEN "fromUserId" = $1 THEN "toUserId" ELSE "fromUserId" END AS other,
                ("fromUserId" = $1) AS "fromMe",
                ("toUserId" = $1 AND "readAt" IS NULL) AS unread
           FROM "AdminMessage" WHERE "fromUserId" = $1 OR "toUserId" = $1
       ), last AS (
         SELECT DISTINCT ON (other) other, body, "createdAt", "fromMe" FROM m WHERE other IS NOT NULL AND other <> $1
          ORDER BY other, "createdAt" DESC, id DESC
       )
       SELECT u.id AS "userId", u.name, l.body AS "lastBody", ${ISO('l."createdAt"')} AS "lastAt", l."fromMe" AS "lastFromMe",
              (SELECT count(*)::int FROM m WHERE m.other = u.id AND m.unread) AS unread,
              (u.active AND u.role = 'ADMIN') AS "canSend"
         FROM last l JOIN "User" u ON u.id = l.other
        ORDER BY l."createdAt" DESC LIMIT 30`,
      [me.id],
    )).rows;
    return { available: true, conversations: rows };
  } catch (err) {
    if (isMissingTable(err)) return { available: false, conversations: [] };
    throw err;
  }
}

/**
 * GET /api/admin/messages?with=<userId>[&before=<ISO>]: historial con esa persona (los más recientes, THREAD_PAGE por página,
 * en orden de tiempo). Al abrirlo se marcan como leídos los mensajes que esa persona me mandó.
 */
export async function getThread(me: StaffUser, withId: unknown, before?: unknown): Promise<AdminThreadResponse> {
  const other = typeof withId === 'string' ? withId : '';
  if (!ID_RE.test(other) || other === me.id) throw new PresenceError('Conversación inválida.');
  const cut = typeof before === 'string' && before ? before : null;
  if (cut && !ISO_RE.test(cut)) throw new PresenceError('Fecha inválida.');
  const u = (await query<{ id: string; name: string; canSend: boolean }>(
    `SELECT id, name, (active AND role = 'ADMIN') AS "canSend" FROM "User" WHERE id = $1`, [other],
  )).rows[0];
  if (!u) throw new PresenceError('Esa cuenta no existe.', 404);
  try {
    if (!cut) {
      await query(
        `UPDATE "AdminMessage" SET "readAt" = ${NOW_UTC} WHERE "toUserId" = $1 AND "fromUserId" = $2 AND "readAt" IS NULL`,
        [me.id, other],
      );
    }
    const rows = (await query<AdminChatMessage>(
      `SELECT id, ("fromUserId" = $1) AS "fromMe", body, ${ISO('"createdAt"')} AS "createdAt",
              CASE WHEN "readAt" IS NULL THEN NULL ELSE ${ISO('"readAt"')} END AS "readAt"
         FROM "AdminMessage"
        WHERE (("fromUserId" = $1 AND "toUserId" = $2) OR ("fromUserId" = $2 AND "toUserId" = $1))
          AND ($3::timestamp IS NULL OR "createdAt" < $3::timestamp)
        ORDER BY "createdAt" DESC, id DESC LIMIT ${THREAD_PAGE + 1}`,
      [me.id, other, cut ? cut.replace('Z', '') : null],
    )).rows;
    const presence = (await query<{ path: string; secondsAgo: number }>(
      `SELECT "path", GREATEST(0, EXTRACT(EPOCH FROM (${NOW_UTC} - "lastSeen")))::int AS "secondsAgo"
         FROM "AdminPresence" WHERE "userId" = $1 AND "lastSeen" > ${NOW_UTC} - make_interval(secs => $2)`,
      [other, ONLINE_SEC],
    )).rows[0] ?? null;
    return {
      available: true,
      with: { userId: u.id, name: u.name, canSend: u.canSend, online: presence },
      messages: rows.slice(0, THREAD_PAGE).reverse(),
      hasMore: rows.length > THREAD_PAGE,
    };
  } catch (err) {
    if (isMissingTable(err)) throw new PresenceError('Los mensajes aún no están habilitados en esta base (falta la migración 020).', 409);
    throw err;
  }
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

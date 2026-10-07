import { NOW_UTC, newId, query, withTransaction } from './db';
import { getExtraBlocked } from './blockedWords';
import { BLOCKED_LANGUAGE_MESSAGE, hasBlockedLanguage, type ExtraBlocked } from '../shared/moderation';
import {
  EVENT_TIMEZONE,
  NOTE_MAX_LENGTH,
  QR_TOKEN_RE,
  parsePageSize,
  type AdminNoteFilters,
  type AdminNoteRow,
  type AdminNotesResponse,
  type Note,
  type NoteFeedItem,
} from '../shared/api';

/**
 * Lógica de "Notas" (experiencia /home del asistente). Ver migrations/002_notes.sql
 * para las decisiones de producto que modela este esquema.
 *
 * Regla de seguridad (brief §18): la identidad del asistente SIEMPRE se
 * resuelve aquí a partir del token de su pulsera (igual que server/attendee.ts
 * -> getMe). Ningún endpoint de notas acepta un id de asistente como
 * parámetro del cliente.
 */

const iso = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export class NoteValidationError extends Error {
  constructor(message: string, readonly code: 'invalid' | 'blocked_language' = 'invalid') {
    super(message);
  }
}

/** Resuelve el attendeeId dueño de una pulsera ACTIVA, o null si el token no aplica. */
async function resolveActiveAttendeeId(token: string): Promise<string | null> {
  if (!QR_TOKEN_RE.test(token)) return null;
  const { rows } = await query<{ attendeeId: string | null }>(
    `SELECT p."attendeeId"
       FROM "Pulse" p
      WHERE p."qrToken" = $1 AND p.status = 'ACTIVE'`,
    [token],
  );
  return rows[0]?.attendeeId ?? null;
}

type NoteRow = {
  id: string;
  text: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  createdAt: Date | string;
  expiresAt: Date | string;
  likeCount: string | number;
  likedByMe: boolean;
};

function toNote(r: NoteRow): Note {
  return {
    id: r.id,
    text: r.text,
    createdAt: new Date(r.createdAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
    visibility: r.visibility,
    likeCount: Number(r.likeCount),
    likedByMe: r.likedByMe,
  };
}

/** Normaliza y valida el texto de una nota. Lanza NoteValidationError si no cumple. */
function cleanNoteText(raw: unknown, extra?: ExtraBlocked): string {
  const text = String(raw ?? '').trim();
  if (text.length === 0) throw new NoteValidationError('Escribe algo antes de publicar.');
  if (text.length > NOTE_MAX_LENGTH) {
    throw new NoteValidationError(`Tu nota no puede tener más de ${NOTE_MAX_LENGTH} caracteres.`);
  }
  // Filtro de lenguaje: la barrera real está aquí (el del cliente es solo cortesía).
  // `extra` = palabras que agregó el Admin (tabla BlockedWord); se suman a la lista fija.
  if (hasBlockedLanguage(text, extra)) throw new NoteValidationError(BLOCKED_LANGUAGE_MESSAGE, 'blocked_language');
  return text;
}

/**
 * Crea una nota para el dueño del token. Desde el 5 oct 2026 es PUBLIC: la ven
 * los demás asistentes en el carrusel de /home (ver shared/api.ts). expiresAt = createdAt + 24h, calculado en SQL para
 * que el servidor de la base (no el reloj del cliente) sea la fuente de
 * verdad.
 *
 * Una persona solo tiene UNA nota activa a la vez (5 oct 2026): publicar una
 * nueva "reemplaza" a la anterior haciéndola expirar en la MISMA sentencia
 * (CTE) -- si el INSERT falla, la anterior no se toca. La fila vieja se
 * conserva como historial ("Mis notas"); no se borra nada.
 */
export async function createNote(
  token: string,
  rawText: unknown,
): Promise<{ ok: true; note: Note } | { ok: false; status: 'not_found' }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false, status: 'not_found' };

  const text = cleanNoteText(rawText, await getExtraBlocked());
  const id = newId();
  // Candado por asistente (pg_advisory_xact_lock, se suelta solo al terminar la
  // transacción): dos publicaciones SIMULTÁNEAS de la misma persona (doble toque,
  // dos pestañas) se ejecutan una tras otra. Sin él, ambas podían leer "no hay
  // nota activa" a la vez y dejar DOS notas vigentes. La CTE corre en una
  // sentencia posterior al candado, así que ya ve lo que la primera confirmó.
  const rows = await withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`note:${attendeeId}`]);
    const res = await tx.query<NoteRow>(
      `WITH retired AS (
         UPDATE "Note" SET "expiresAt" = ${NOW_UTC}
          WHERE "attendeeId" = $2 AND "expiresAt" > ${NOW_UTC}
       )
       INSERT INTO "Note" (id, "attendeeId", "text", "visibility", "createdAt", "expiresAt")
       VALUES ($1, $2, $3, 'PUBLIC', ${NOW_UTC}, ${NOW_UTC} + INTERVAL '24 hours')
       RETURNING id, "text", "visibility", "createdAt", "expiresAt", 0 AS "likeCount", false AS "likedByMe"`,
      [id, attendeeId, text],
    );
    return res.rows;
  });
  return { ok: true, note: toNote(rows[0]) };
}

/**
 * "Quitar nota": retira la nota activa del dueño del token haciéndola expirar
 * AHORA (expiresAt = ahora). No borra la fila: sigue en "Mis notas" como
 * historial, igual que cualquier nota vencida. Si por datos viejos hubiera más
 * de una activa, se retiran todas (si no, al quitar la más reciente
 * reaparecería la anterior). Idempotente: sin nota activa devuelve removed 0.
 */
export async function removeMyActiveNote(
  token: string,
): Promise<{ ok: true; removed: number } | { ok: false; status: 'not_found' }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false, status: 'not_found' };

  const res = await query(
    `UPDATE "Note" SET "expiresAt" = ${NOW_UTC}
      WHERE "attendeeId" = $1 AND "expiresAt" > ${NOW_UTC}`,
    [attendeeId],
  );
  return { ok: true, removed: res.rowCount ?? 0 };
}

/**
 * Notas del dueño del token (todas: activas y expiradas -- "expirada" es un
 * estado de visibilidad, no de borrado; esta vista es "Mis notas", no el
 * feed público). Más reciente primero.
 */
export async function listMyNotes(token: string): Promise<{ ok: true; notes: Note[] } | { ok: false; status: 'not_found' }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false, status: 'not_found' };

  const { rows } = await query<NoteRow>(
    `SELECT n.id, n."text", n."visibility", n."createdAt", n."expiresAt",
            COUNT(l.id) AS "likeCount",
            BOOL_OR(l."attendeeId" = $1) AS "likedByMe"
       FROM "Note" n
       LEFT JOIN "NoteLike" l ON l."noteId" = n.id
      WHERE n."attendeeId" = $1
      GROUP BY n.id
      ORDER BY n."createdAt" DESC`,
    [attendeeId],
  );
  return { ok: true, notes: rows.map(toNote) };
}

/**
 * Carrusel de /home: notas PÚBLICAS y vigentes de OTROS asistentes (la del dueño del
 * token no entra: él la ve en su propio avatar). Más recientes primero, máximo FEED_MAX.
 * Solo se expone el primer nombre. Además se vuelve a pasar el filtro de lenguaje, por si
 * hay notas de antes de que existiera (o se amplíe la lista después).
 */
const FEED_MAX = 40;
export async function listNotesFeed(token: string): Promise<{ ok: true; notes: NoteFeedItem[] } | { ok: false; status: 'not_found' }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false, status: 'not_found' };

  const { rows } = await query<{ id: string; text: string; createdAt: string; expiresAt: string; attendeeId: string; fullName: string; likeCount: number; likedByMe: boolean }>(
    `SELECT n.id, n."text", ${iso('n."createdAt"')} AS "createdAt", ${iso('n."expiresAt"')} AS "expiresAt",
            a.id AS "attendeeId", a."fullName",
            0 AS "likeCount", -- el contador es SOLO del dueño de la nota: en las notas de otros nunca se envía
            EXISTS (SELECT 1 FROM "NoteLike" l WHERE l."noteId" = n.id AND l."attendeeId" = $1) AS "likedByMe"
       FROM "Note" n
       JOIN "Attendee" a ON a.id = n."attendeeId"
      WHERE n."visibility" = 'PUBLIC' AND n."expiresAt" > ${NOW_UTC} AND n."attendeeId" <> $1
      ORDER BY n."createdAt" DESC
      LIMIT ${FEED_MAX * 2}`,
    [attendeeId],
  );
  const extra = await getExtraBlocked();
  const notes = rows
    .filter((r) => !hasBlockedLanguage(r.text, extra))
    .slice(0, FEED_MAX)
    .map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      attendeeId: r.attendeeId,
      firstName: r.fullName.trim().split(/\s+/)[0] ?? '',
      likeCount: Number(r.likeCount),
      likedByMe: r.likedByMe,
    }));
  return { ok: true, notes };
}

/**
 * Alterna el like del dueño del token a una nota. Reglas (5 oct 2026): solo notas
 * PÚBLICAS y VIGENTES de OTRA persona (no se da like a la propia, ni a una vencida,
 * ni a una privada). Cualquier otro caso responde `note_not_found`, para no revelar
 * si existe una nota que no puede ver.
 */
export async function toggleNoteLike(
  token: string,
  noteId: string,
): Promise<{ ok: true; liked: boolean; likeCount: number } | { ok: false; reason: 'invalid_session' | 'note_not_found' | 'own_note' }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false, reason: 'invalid_session' };

  const note = await query<{ attendeeId: string }>(
    `SELECT "attendeeId" FROM "Note" WHERE id = $1 AND "visibility" = 'PUBLIC' AND "expiresAt" > ${NOW_UTC}`,
    [noteId],
  );
  if (note.rowCount === 0) return { ok: false, reason: 'note_not_found' };
  if (note.rows[0].attendeeId === attendeeId) return { ok: false, reason: 'own_note' };

  const removed = await query(`DELETE FROM "NoteLike" WHERE "noteId" = $1 AND "attendeeId" = $2`, [noteId, attendeeId]);
  let liked = false;
  if (removed.rowCount === 0) {
    await query(
      `INSERT INTO "NoteLike" (id, "noteId", "attendeeId", "createdAt")
       VALUES ($1, $2, $3, ${NOW_UTC})
       ON CONFLICT ("noteId", "attendeeId") DO NOTHING`,
      [newId(), noteId, attendeeId],
    );
    liked = true;
  }

  // El contador de likes es solo del dueño de la nota: quien da like NO recibe el total (siempre 0 aquí).
  return { ok: true, liked, likeCount: 0 };
}

/** Quién le dio like a la nota vigente del dueño del token (solo la suya). */
export async function listMyNoteLikers(
  token: string,
): Promise<{ ok: true; likers: { attendeeId: string; firstName: string }[] } | { ok: false }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false };
  const { rows } = await query<{ attendeeId: string; fullName: string }>(
    `SELECT a.id AS "attendeeId", a."fullName"
       FROM "Note" n
       JOIN "NoteLike" l ON l."noteId" = n.id
       JOIN "Attendee" a ON a.id = l."attendeeId"
      WHERE n."attendeeId" = $1 AND n."expiresAt" > ${NOW_UTC}
      ORDER BY l."createdAt" DESC
      LIMIT 50`,
    [attendeeId],
  );
  return { ok: true, likers: rows.map((r) => ({ attendeeId: r.attendeeId, firstName: r.fullName.trim().split(/\s+/)[0] ?? '' })) };
}

/* ------------------------------------------------------------------ */
/* Admin -> Notas (solo lectura): filtros, orden y paginación en el     */
/* servidor, misma receta que Asistentes/Canjes.                        */
/* ------------------------------------------------------------------ */

const TZ = EVENT_TIMEZONE;
const local = (col: string) => `((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`;
const unaccent = (expr: string) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;

type AdminNoteDbRow = {
  id: string;
  text: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
  retired: boolean;
  likeCount: number;
  attendeeId: string;
  attendeeName: string;
  churchName: string;
  zoneName: string;
};

export async function listNotesAdmin(f: AdminNoteFilters): Promise<AdminNotesResponse> {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };

  const words = String(f.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const w of words) {
    add((n) => `(${unaccent('a."fullName"')} LIKE ${unaccent(`$${n}`)} OR ${unaccent('n."text"')} LIKE ${unaccent(`$${n}`)})`, `%${w}%`);
  }
  if (f.status === 'ACTIVA') where.push(`n."expiresAt" > ${NOW_UTC}`);
  if (f.status === 'VENCIDA') where.push(`n."expiresAt" <= ${NOW_UTC}`);
  if (f.zoneId) add((n) => `z.id = $${n}`, f.zoneId);
  if (f.presbyteryId) add((n) => `pr.id = $${n}`, f.presbyteryId);
  if (f.churchId) add((n) => `c.id = $${n}`, f.churchId);
  if (f.likes === 'with') where.push(`lk.likes > 0`);
  if (f.likes === 'without') where.push(`lk.likes = 0`);
  if (f.from) add((n) => `${local('n."createdAt"')} >= $${n}::date`, f.from);
  if (f.to) add((n) => `${local('n."createdAt"')} < ($${n}::date + 1)`, f.to);

  const from = `
    FROM "Note" n
    JOIN "Attendee" a ON a.id = n."attendeeId"
    JOIN "Church" c ON c.id = a."churchId"
    JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
    JOIN "Zone" z ON z.id = pr."zoneId"
    LEFT JOIN LATERAL (SELECT count(*)::int AS likes FROM "NoteLike" l WHERE l."noteId" = n.id) lk ON true
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;

  const total = (await query<{ n: number }>(`SELECT count(*)::int AS n ${from}`, params)).rows[0].n;
  const pageSize = parsePageSize(f.pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const page = Math.min(lastPage, Math.max(0, Math.floor(Number(f.page) || 0)));
  const order =
    f.sort === 'likes' ? `lk.likes DESC, n."createdAt" DESC, n.id DESC` : `n."createdAt" DESC, n.id DESC`;

  const { rows } = await query<AdminNoteDbRow>(
    `SELECT n.id, n."text", ${iso('n."createdAt"')} AS "createdAt", ${iso('n."expiresAt"')} AS "expiresAt",
            (n."expiresAt" > ${NOW_UTC}) AS active, lk.likes AS "likeCount",
            EXISTS (SELECT 1 FROM "AuditLog" al WHERE al."entityType" = 'Note' AND al."entityId" = n.id AND al.action = 'note.retire') AS retired,
            a.id AS "attendeeId", a."fullName" AS "attendeeName", c.name AS "churchName", z.name AS "zoneName"
       ${from}
      ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${page * pageSize}`,
    params,
  );

  const sum = (
    await query<{ total: number; active: number; expired: number; authors: number; likes: number }>(
      `SELECT count(*)::int AS total,
              (count(*) FILTER (WHERE "expiresAt" > ${NOW_UTC}))::int AS active,
              (count(*) FILTER (WHERE "expiresAt" <= ${NOW_UTC}))::int AS expired,
              count(DISTINCT "attendeeId")::int AS authors,
              (SELECT count(*)::int FROM "NoteLike") AS likes
         FROM "Note"`,
    )
  ).rows[0];

  const out: AdminNoteRow[] = rows.map((r) => ({
    id: r.id,
    text: r.text,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    status: r.active ? 'ACTIVA' : 'VENCIDA',
    likeCount: Number(r.likeCount),
    retiredByAdmin: r.retired,
    attendeeId: r.attendeeId,
    attendeeName: r.attendeeName,
    churchName: r.churchName,
    zoneName: r.zoneName,
  }));
  return { total, page, pageSize, rows: out, summary: sum };
}

/**
 * Moderación: el Admin RETIRA una nota activa (expiresAt = ahora; la fila no se
 * borra, queda como Vencida y se conserva para el historial). Deja AuditLog
 * 'note.retire' con el motivo y el autor. Idempotente: si ya estaba vencida
 * responde `already_expired` sin escribir nada.
 */
export const RETIRE_REASON_MAX = 200;

export class NoteRetireError extends Error {}

export async function retireNoteAsAdmin(
  noteId: string,
  actorId: string,
  rawReason: unknown,
): Promise<{ outcome: 'ok' | 'not_found' | 'already_expired' }> {
  const reason = String(rawReason ?? '').trim();
  if (!reason) throw new NoteRetireError('Escribe el motivo para retirar la nota.');
  if (reason.length > RETIRE_REASON_MAX) throw new NoteRetireError(`El motivo no puede pasar de ${RETIRE_REASON_MAX} caracteres.`);

  return withTransaction(async (tx) => {
    const found = await tx.query<{ attendeeId: string; text: string; active: boolean }>(
      `SELECT "attendeeId", "text", ("expiresAt" > ${NOW_UTC}) AS active FROM "Note" WHERE id = $1 FOR UPDATE`,
      [noteId],
    );
    const note = found.rows[0];
    if (!note) return { outcome: 'not_found' as const };
    if (!note.active) return { outcome: 'already_expired' as const };

    await tx.query(`UPDATE "Note" SET "expiresAt" = ${NOW_UTC} WHERE id = $1`, [noteId]);
    const author = (await tx.query<{ fullName: string }>(`SELECT "fullName" FROM "Attendee" WHERE id = $1`, [note.attendeeId])).rows[0];
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'note.retire', 'Note', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, noteId, JSON.stringify({ reason, attendeeId: note.attendeeId, attendeeName: author?.fullName ?? null, text: note.text })],
    );
    return { outcome: 'ok' as const };
  });
}

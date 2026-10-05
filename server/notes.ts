import { NOW_UTC, newId, query } from './db';
import { NOTE_MAX_LENGTH, QR_TOKEN_RE, type Note } from '../shared/api';

/**
 * Lógica de "Notas" (experiencia /home del asistente). Ver migrations/002_notes.sql
 * para las decisiones de producto que modela este esquema.
 *
 * Regla de seguridad (brief §18): la identidad del asistente SIEMPRE se
 * resuelve aquí a partir del token de su pulsera (igual que server/attendee.ts
 * -> getMe). Ningún endpoint de notas acepta un id de asistente como
 * parámetro del cliente.
 */

export class NoteValidationError extends Error {}

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
function cleanNoteText(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (text.length === 0) throw new NoteValidationError('Escribe algo antes de publicar.');
  if (text.length > NOTE_MAX_LENGTH) {
    throw new NoteValidationError(`Tu nota no puede tener más de ${NOTE_MAX_LENGTH} caracteres.`);
  }
  return text;
}

/**
 * Crea una nota para el dueño del token. Siempre PRIVATE en esta versión
 * (ver shared/api.ts). expiresAt = createdAt + 24h, calculado en SQL para
 * que el servidor de la base (no el reloj del cliente) sea la fuente de
 * verdad.
 */
export async function createNote(
  token: string,
  rawText: unknown,
): Promise<{ ok: true; note: Note } | { ok: false; status: 'not_found' }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false, status: 'not_found' };

  const text = cleanNoteText(rawText);
  const id = newId();
  const { rows } = await query<NoteRow>(
    `INSERT INTO "Note" (id, "attendeeId", "text", "visibility", "createdAt", "expiresAt")
     VALUES ($1, $2, $3, 'PRIVATE', ${NOW_UTC}, ${NOW_UTC} + INTERVAL '24 hours')
     RETURNING id, "text", "visibility", "createdAt", "expiresAt", 0 AS "likeCount", false AS "likedByMe"`,
    [id, attendeeId, text],
  );
  return { ok: true, note: toNote(rows[0]) };
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
 * Alterna el like del dueño del token a una nota. No importa si la nota ya
 * expiró (dar like a una nota vieja no la "revive"; solo queda registrado).
 */
export async function toggleNoteLike(
  token: string,
  noteId: string,
): Promise<{ ok: true; liked: boolean; likeCount: number } | { ok: false; reason: 'invalid_session' | 'note_not_found' }> {
  const attendeeId = await resolveActiveAttendeeId(token);
  if (!attendeeId) return { ok: false, reason: 'invalid_session' };

  const exists = await query(`SELECT 1 FROM "Note" WHERE id = $1`, [noteId]);
  if (exists.rowCount === 0) return { ok: false, reason: 'note_not_found' };

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

  const { rows } = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "NoteLike" WHERE "noteId" = $1`, [noteId]);
  return { ok: true, liked, likeCount: Number(rows[0]?.count ?? 0) };
}

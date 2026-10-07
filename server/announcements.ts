import { NOW_UTC, newId, query, withTransaction } from './db';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  NOTIFICATIONS_MAX,
  zoneAudienceOf,
  type AdminAnnouncementFilters,
  type AdminAnnouncementRow,
  type AdminAnnouncementsResponse,
  type AnnouncementAudience,
  type AnnouncementStatus,
  type AppNotification,
  type CreateAnnouncementRequest,
  type NotificationsResponse,
} from '../shared/notifications';
import { QR_TOKEN_RE } from '../shared/api';
import { programReminders } from '../shared/programSchedule';

/**
 * Avisos del equipo + campana (migración 006). El asistente se identifica SIEMPRE por el
 * token de su pulsera (nunca por un id del cliente), igual que las Notas.
 */

const iso = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export class AnnouncementError extends Error {}

/** Cuánto en el futuro puede programarse un aviso (evita un año mal escrito). */
const MAX_AHEAD_DAYS = 60;

/* ------------------------------------------------------------------ */
/* Asistente                                                           */
/* ------------------------------------------------------------------ */

async function resolveAttendee(token: string): Promise<{ attendeeId: string; zone: 'Zona 1' | 'Zona 2' } | null> {
  if (!QR_TOKEN_RE.test(token)) return null;
  const { rows } = await query<{ attendeeId: string | null; zoneName: string | null }>(
    `SELECT p."attendeeId", z.name AS "zoneName"
       FROM "Pulse" p
       LEFT JOIN "Attendee" a ON a.id = p."attendeeId"
       LEFT JOIN "Church" c ON c.id = a."churchId"
       LEFT JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
       LEFT JOIN "Zone" z ON z.id = pr."zoneId"
      WHERE p."qrToken" = $1 AND p.status = 'ACTIVE'`,
    [token],
  );
  const r = rows[0];
  if (!r?.attendeeId) return null;
  return { attendeeId: r.attendeeId, zone: zoneAudienceOf(r.zoneName) };
}

/** Si la tabla/columna aún no existe (migración 006/007 sin aplicar) la campana queda vacía en vez de romper /home. */
const isMissingSchema = (err: unknown) => ['42P01', '42703'].includes((err as { code?: string })?.code ?? '');

export async function listNotifications(
  token: string,
): Promise<{ ok: true; data: NotificationsResponse } | { ok: false; status: 'not_found' }> {
  const who = await resolveAttendee(token);
  if (!who) return { ok: false, status: 'not_found' };
  try {
    const ann = await query<{ id: string; title: string; body: string; live: boolean; at: string; unread: boolean }>(
      `SELECT n.id, n."title", n."body", n."live", ${iso('n."publishAt"')} AS at,
              (s."seenAt" IS NULL OR n."publishAt" > s."seenAt") AS unread
         FROM "Announcement" n
         LEFT JOIN "NotificationState" s ON s."attendeeId" = $1
        WHERE n."retiredAt" IS NULL
          AND n."publishAt" <= ${NOW_UTC}
          AND n."audience" IN ('ALL', $2)
        ORDER BY n."publishAt" DESC
        LIMIT ${NOTIFICATIONS_MAX}`,
      [who.attendeeId, who.zone],
    );
    // Likes a TUS notas: una fila por nota (agrupada), con quien dio el like más reciente.
    const likes = await query<{ noteId: string; cnt: number; likerId: string; likerName: string; at: string; unread: boolean }>(
      `SELECT n.id AS "noteId", c.cnt, latest."attendeeId" AS "likerId", latest."fullName" AS "likerName",
              ${iso('latest."createdAt"')} AS at,
              (s."seenAt" IS NULL OR latest."createdAt" > s."seenAt") AS unread
         FROM "Note" n
         JOIN LATERAL (
           SELECT l."attendeeId", a."fullName", l."createdAt"
             FROM "NoteLike" l JOIN "Attendee" a ON a.id = l."attendeeId"
            WHERE l."noteId" = n.id AND l."attendeeId" <> n."attendeeId"
            ORDER BY l."createdAt" DESC LIMIT 1
         ) latest ON true
         JOIN LATERAL (SELECT count(*)::int AS cnt FROM "NoteLike" l2 WHERE l2."noteId" = n.id) c ON true
         LEFT JOIN "NotificationState" s ON s."attendeeId" = $1
        WHERE n."attendeeId" = $1
        ORDER BY latest."createdAt" DESC
        LIMIT ${NOTIFICATIONS_MAX}`,
      [who.attendeeId],
    );
    // Recordatorios del programa (fase 3): se calculan al leer; PROGRAM_REMINDERS=off los apaga.
    let reminders: AppNotification[] = [];
    if ((process.env.PROGRAM_REMINDERS ?? '').toLowerCase() !== 'off') {
      const st = await query<{ seenAt: string | null }>(`SELECT ${iso('"seenAt"')} AS "seenAt" FROM "NotificationState" WHERE "attendeeId" = $1`, [who.attendeeId]);
      const seen = st.rows[0]?.seenAt ? new Date(st.rows[0].seenAt) : null;
      reminders = programReminders(new Date(), who.zone, seen);
    }
    const items: AppNotification[] = [
      ...reminders,
      ...ann.rows.map((r): AppNotification => ({ id: r.id, kind: 'announcement', title: r.title, body: r.body, live: r.live, at: r.at, unread: r.unread })),
      ...likes.rows.map(
        (r): AppNotification => ({
          id: r.noteId,
          kind: 'like',
          likerAttendeeId: r.likerId,
          likerFirstName: r.likerName.trim().split(/\s+/)[0] ?? '',
          count: Number(r.cnt),
          at: r.at,
          unread: r.unread,
        }),
      ),
    ]
      .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
      .slice(0, NOTIFICATIONS_MAX);
    return { ok: true, data: { items, unread: items.filter((i) => i.unread).length } };
  } catch (err) {
    if (isMissingSchema(err)) return { ok: true, data: { items: [], unread: 0 } };
    throw err;
  }
}

/** El asistente abrió la campana: todo lo publicado hasta ahora queda como leído. */
export async function markNotificationsSeen(token: string): Promise<{ ok: true } | { ok: false; status: 'not_found' }> {
  const who = await resolveAttendee(token);
  if (!who) return { ok: false, status: 'not_found' };
  try {
    await query(
      `INSERT INTO "NotificationState" ("attendeeId", "seenAt") VALUES ($1, ${NOW_UTC})
       ON CONFLICT ("attendeeId") DO UPDATE SET "seenAt" = EXCLUDED."seenAt"`,
      [who.attendeeId],
    );
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

const STATUS_SQL = `CASE WHEN n."retiredAt" IS NOT NULL THEN 'RETIRADO'
                         WHEN n."publishAt" > ${NOW_UTC} THEN 'PROGRAMADO'
                         ELSE 'PUBLICADO' END`;

export async function listAnnouncementsAdmin(f: AdminAnnouncementFilters): Promise<AdminAnnouncementsResponse> {
  const pageSize = f.pageSize ?? 10;
  const page = Math.max(0, Math.floor(f.page ?? 0));
  const where = f.status ? `WHERE ${STATUS_SQL} = $1` : '';
  const params = f.status ? [f.status] : [];

  const total = Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM "Announcement" n ${where}`, params)).rows[0]?.n ?? 0,
  );
  const { rows } = await query<{
    id: string; title: string; body: string; audience: AnnouncementAudience; live: boolean;
    publishAt: string; retiredAt: string | null; createdAt: string; createdByName: string | null; status: AnnouncementStatus;
  }>(
    `SELECT n.id, n."title", n."body", n."audience", n."live",
            ${iso('n."publishAt"')} AS "publishAt", ${iso('n."retiredAt"')} AS "retiredAt", ${iso('n."createdAt"')} AS "createdAt",
            u."name" AS "createdByName", ${STATUS_SQL} AS status
       FROM "Announcement" n
       LEFT JOIN "User" u ON u.id = n."createdById"
       ${where}
      ORDER BY n."publishAt" DESC, n.id DESC
      LIMIT ${pageSize} OFFSET ${page * pageSize}`,
    params,
  );
  const sum = (
    await query<{ published: number; scheduled: number; retired: number }>(
      `SELECT (count(*) FILTER (WHERE ${STATUS_SQL} = 'PUBLICADO'))::int AS published,
              (count(*) FILTER (WHERE ${STATUS_SQL} = 'PROGRAMADO'))::int AS scheduled,
              (count(*) FILTER (WHERE ${STATUS_SQL} = 'RETIRADO'))::int AS retired
         FROM "Announcement" n`,
    )
  ).rows[0];
  return { total, page, pageSize, rows: rows as AdminAnnouncementRow[], summary: sum };
}

async function audit(tx: { query: (sql: string, p: unknown[]) => Promise<unknown> }, actorId: string, action: string, id: string, metadata: unknown) {
  await tx.query(
    `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
     VALUES ($1, $2, $3, 'Announcement', $4, $5::jsonb, ${NOW_UTC})`,
    [newId(), actorId, action, id, JSON.stringify(metadata)],
  );
}

export async function createAnnouncement(actorId: string, raw: Partial<CreateAnnouncementRequest>) {
  const title = String(raw.title ?? '').trim().replace(/\s+/g, ' ');
  const body = String(raw.body ?? '').trim();
  if (!title) throw new AnnouncementError('Escribe el título del aviso.');
  if (title.length > ANNOUNCEMENT_TITLE_MAX) throw new AnnouncementError(`El título no puede pasar de ${ANNOUNCEMENT_TITLE_MAX} caracteres.`);
  if (!body) throw new AnnouncementError('Escribe el mensaje del aviso.');
  if (body.length > ANNOUNCEMENT_BODY_MAX) throw new AnnouncementError(`El mensaje no puede pasar de ${ANNOUNCEMENT_BODY_MAX} caracteres.`);
  const audience = raw.audience as AnnouncementAudience;
  if (!ANNOUNCEMENT_AUDIENCES.includes(audience)) throw new AnnouncementError('Elige a quién le llega el aviso.');

  let publishAt: Date | null = null;
  if (raw.publishAt) {
    publishAt = new Date(raw.publishAt);
    if (Number.isNaN(publishAt.getTime())) throw new AnnouncementError('La fecha de publicación no es válida.');
    if (publishAt.getTime() > Date.now() + MAX_AHEAD_DAYS * 86_400_000) {
      throw new AnnouncementError(`No se puede programar con más de ${MAX_AHEAD_DAYS} días de anticipación.`);
    }
    // Una hora ya pasada (o dentro del último minuto) = publicar ahora.
    if (publishAt.getTime() <= Date.now()) publishAt = null;
  }

  const live = raw.live === true;
  const id = newId();
  const scheduled = publishAt !== null;
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO "Announcement" (id, "title", "body", "audience", "live", "publishAt", "createdAt", "createdById")
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, ${NOW_UTC}), ${NOW_UTC}, $7)`,
      [id, title, body, audience, live, publishAt ? publishAt.toISOString() : null, actorId],
    );
    await audit(tx, actorId, 'announcement.create', id, { title, audience, live, scheduled, publishAt: publishAt?.toISOString() ?? null });
  });
  return { id, status: (scheduled ? 'PROGRAMADO' : 'PUBLICADO') as AnnouncementStatus };
}

/** Retira un aviso (publicado o programado). Idempotente. La fila se conserva. */
export async function retireAnnouncement(id: string, actorId: string): Promise<{ outcome: 'ok' | 'already_retired' | 'not_found' }> {
  return withTransaction(async (tx) => {
    const found = await tx.query<{ title: string; audience: string; retired: boolean }>(
      `SELECT "title", "audience", ("retiredAt" IS NOT NULL) AS retired FROM "Announcement" WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = found.rows[0];
    if (!row) return { outcome: 'not_found' as const };
    if (row.retired) return { outcome: 'already_retired' as const };
    await tx.query(`UPDATE "Announcement" SET "retiredAt" = ${NOW_UTC} WHERE id = $1`, [id]);
    await audit(tx, actorId, 'announcement.retire', id, { title: row.title, audience: row.audience });
    return { outcome: 'ok' as const };
  });
}

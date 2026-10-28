import { NOW_UTC, newId, query, withTransaction } from './db';
import { isMissing017, isMissing018, isWinningDraw, publicWinnerName } from './raffles';
import { QR_TOKEN_RE, type AdminRaffleEntriesResponse, type AdminRaffleEntry, type MyRaffleResponse } from '../shared/api';
import { checkRaffleAnswers, prizeForKit } from '../shared/raffle';

/**
 * Inscripción a la rifa con 3 preguntas (migración 017).
 *
 * - La identidad SIEMPRE sale del token de la pulsera (x-pulse-token), resuelto aquí: pulsera ACTIVE con asistente.
 *   El kit también sale de la pulsera; el navegador nunca elige a qué rifa entra.
 * - Una inscripción por asistente y kit (UNIQUE en la base). Inscribirse es solo-INSERT: si ya estaba inscrito se
 *   devuelve lo que hay y NO se cambian las respuestas (doble toque / reintento de red = sin efecto).
 * - Solo kits con premio (shared/raffle.ts). «Inscripción Domingo» no tiene rifa.
 * - «Quitar» (migración 018) NO borra la fila: marca removedAt. Quien está quitado no entra al sorteo y no puede volver
 *   a inscribirse (la fila sigue ahí); «Restaurar» lo regresa. Ambas acciones quedan en la auditoría.
 * - Las inscripciones se abren/cierran desde Admin → Rifas. El valor se guarda con el mismo patrón que la
 *   configuración global (server/settings.ts): la última fila de "AuditLog" con entityType 'Setting'. Sin ninguna
 *   fila = ABIERTAS. Así cada cambio queda auditado y no hace falta otra tabla.
 */

const SETTING_TYPE = 'Setting';
const SETTING_ACTION = 'setting.update';
const SETTING_ID = 'raffleEntriesOpen';

const isMissingTable = (err: unknown) => (err as { code?: string })?.code === '42P01';
const isMissing = (err: unknown) => isMissingTable(err) || isMissing017(err) || isMissing018(err);

export class RaffleEntryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function getEntriesOpen(): Promise<boolean> {
  const { rows } = await query<{ value: string | null }>(
    `SELECT metadata->>'value' AS value FROM "AuditLog"
      WHERE "entityType" = $1 AND "entityId" = $2 AND action = $3
      ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
    [SETTING_TYPE, SETTING_ID, SETTING_ACTION],
  );
  return rows[0]?.value !== 'false';
}

/** Solo lo llama /api/admin/raffle-entries (cuentas autorizadas de Rifas). */
export async function setEntriesOpen(actorId: string, open: unknown): Promise<boolean> {
  if (typeof open !== 'boolean') throw new RaffleEntryError('Valor inválido: usa true o false.');
  const current = await getEntriesOpen();
  if (current === open) return open;
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, ${NOW_UTC})`,
      [newId(), actorId, SETTING_ACTION, SETTING_TYPE, SETTING_ID, JSON.stringify({ value: String(open), previous: String(current) })],
    );
  });
  return open;
}

type Holder = { attendeeId: string; pulseId: string; packageId: string; kitName: string };

/** Dueño de la pulsera: solo una pulsera ACTIVE con asistente (nunca una pulsera del equipo). */
async function holder(token: string): Promise<Holder | null> {
  if (!QR_TOKEN_RE.test(token)) return null;
  const { rows } = await query<Holder>(
    `SELECT p."attendeeId", p.id AS "pulseId", p."packageId", k.name AS "kitName"
       FROM "Pulse" p JOIN "Package" k ON k.id = p."packageId"
      WHERE p."qrToken" = $1 AND p.status = 'ACTIVE' AND p."attendeeId" IS NOT NULL`,
    [token],
  );
  return rows[0] ?? null;
}

const ISO = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Resultado de la rifa más reciente (no cancelada) del kit, solo si ya salió al menos un ganador. Nombres públicos. */
async function kitResult(packageId: string, attendeeId: string): Promise<MyRaffleResponse['result']> {
  const r = (await query<{ id: string; name: string; winningPosition: number | null }>(
    `SELECT id, name, "winningPosition" FROM "Raffle"
      WHERE "packageId" = $1 AND status <> 'CANCELLED'
      ORDER BY edition DESC LIMIT 1`,
    [packageId],
  )).rows[0];
  if (!r) return null;
  const draws = (await query<{ position: number; extra: boolean; winnerName: string; attendeeId: string | null }>(
    `SELECT "position", extra, "winnerName", "attendeeId" FROM "RaffleWinner" WHERE "raffleId" = $1 ORDER BY "position"`,
    [r.id],
  )).rows.filter((w) => isWinningDraw(r.winningPosition, w));
  if (draws.length === 0) return null;
  return {
    raffleName: r.name,
    winners: draws.map((w) => publicWinnerName(w.winnerName)),
    youWon: draws.some((w) => w.attendeeId === attendeeId),
  };
}

async function buildMine(h: Holder): Promise<MyRaffleResponse> {
  const hasRaffle = prizeForKit(h.kitName) !== null;
  const base = { kitName: h.kitName, hasRaffle };
  try {
    const entriesOpen = await getEntriesOpen();
    const entry = (await query<NonNullable<MyRaffleResponse['entry']>>(
      `SELECT ${ISO('"createdAt"')} AS "createdAt", "answerLiked" AS liked, "answerPlenary" AS plenary, "answerLesson" AS lesson,
              ("removedAt" IS NOT NULL) AS removed
         FROM "RaffleEntry" WHERE "attendeeId" = $1 AND "packageId" = $2`,
      [h.attendeeId, h.packageId],
    )).rows[0] ?? null;
    const result = hasRaffle ? await kitResult(h.packageId, h.attendeeId) : null;
    return { available: true, ...base, entriesOpen, entry, result };
  } catch (err) {
    if (isMissing(err)) return { available: false, ...base, entriesOpen: false, entry: null, result: null };
    throw err;
  }
}

/** GET /api/raffle-entry. null = el token no corresponde a una pulsera activa de asistente (401). */
export async function getMyRaffle(token: string): Promise<MyRaffleResponse | null> {
  const h = await holder(token);
  return h ? buildMine(h) : null;
}

/**
 * POST /api/raffle-entry. Inscribe al dueño de la pulsera en la rifa de SU kit con sus 3 respuestas.
 * null = sin sesión (401). Errores de negocio: RaffleEntryError con su código.
 */
export async function submitEntry(token: string, body: unknown): Promise<MyRaffleResponse | null> {
  const h = await holder(token);
  if (!h) return null;
  if (!prizeForKit(h.kitName)) throw new RaffleEntryError('Tu kit no incluye rifa.', 403);
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  try {
    // Ya inscrito: se devuelve lo que hay (no se reescriben respuestas), aunque las inscripciones ya estén cerradas.
    // Si el equipo lo quitó (018) su fila sigue ahí, así que tampoco puede volver a inscribirse.
    const already = await query(`SELECT "removedAt" FROM "RaffleEntry" WHERE "attendeeId" = $1 AND "packageId" = $2`, [h.attendeeId, h.packageId]);
    if ((already.rowCount ?? 0) > 0) return buildMine(h);
    if (!(await getEntriesOpen())) throw new RaffleEntryError('Las inscripciones a la rifa ya cerraron.', 409);
    const checked = checkRaffleAnswers(input);
    if (!checked.ok) throw new RaffleEntryError(checked.error);
    const { liked, plenary, lesson } = checked.answers;
    await query(
      `INSERT INTO "RaffleEntry" (id, "attendeeId", "packageId", "pulseId", "answerLiked", "answerPlenary", "answerLesson", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${NOW_UTC})
       ON CONFLICT ("attendeeId", "packageId") DO NOTHING`,
      [newId(), h.attendeeId, h.packageId, h.pulseId, liked, plenary, lesson],
    );
    return buildMine(h);
  } catch (err) {
    if (isMissing(err)) throw new RaffleEntryError('La rifa todavía no está disponible.', 409);
    throw err;
  }
}

/** GET /api/admin/raffle-entries: quién entró a cada rifa (kits con premio), con sus respuestas. Más reciente primero. */
export async function listEntries(): Promise<AdminRaffleEntriesResponse> {
  const kits = (await query<{ id: string; name: string }>(`SELECT id, name FROM "Package" ORDER BY price DESC, name`)).rows
    .filter((k) => prizeForKit(k.name) !== null);
  try {
    const entriesOpen = await getEntriesOpen();
    const { rows } = await query<AdminRaffleEntry & { packageId: string }>(
      `SELECT e."packageId", a.id AS "attendeeId", a."fullName", COALESCE(c.name, '') AS "churchName",
              ${ISO('e."createdAt"')} AS "createdAt",
              e."answerLiked" AS liked, e."answerPlenary" AS plenary, e."answerLesson" AS lesson,
              (e."removedAt" IS NULL AND EXISTS (SELECT 1 FROM "Pulse" p WHERE p."attendeeId" = a.id AND p.status = 'ACTIVE' AND p."packageId" = e."packageId")) AS eligible,
              (e."removedAt" IS NOT NULL) AS removed,
              CASE WHEN e."removedAt" IS NULL THEN NULL ELSE ${ISO('e."removedAt"')} END AS "removedAt",
              u.name AS "removedByName"
         FROM "RaffleEntry" e
         JOIN "Attendee" a ON a.id = e."attendeeId"
         LEFT JOIN "Church" c ON c.id = a."churchId"
         LEFT JOIN "User" u ON u.id = e."removedById"
        ORDER BY e."createdAt" DESC, e.id`,
    );
    return {
      available: true,
      entriesOpen,
      kits: kits.map((k) => ({
        packageId: k.id,
        kitName: k.name,
        entries: rows.filter((r) => r.packageId === k.id).map(({ packageId: _p, ...rest }) => rest),
      })),
    };
  } catch (err) {
    if (isMissing(err)) return { available: false, entriesOpen: false, kits: kits.map((k) => ({ packageId: k.id, kitName: k.name, entries: [] })) };
    throw err;
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * PATCH /api/admin/raffle-entries/:packageId/:attendeeId { removed }. Quita (true) o restaura (false) a una persona de la
 * rifa de ese kit. No borra respuestas ni toca lo ya sorteado. Idempotente: repetir el mismo estado no escribe nada.
 * Devuelve la lista actualizada de inscritos. Solo cuentas autorizadas de Rifas (lo revisa la función).
 */
export async function setEntryRemoved(actorId: string, packageId: string, attendeeId: string, removed: unknown): Promise<AdminRaffleEntriesResponse> {
  if (typeof removed !== 'boolean') throw new RaffleEntryError('Valor inválido: usa true o false.');
  if (!ID_RE.test(packageId) || !ID_RE.test(attendeeId)) throw new RaffleEntryError('Esa inscripción no existe.', 404);
  try {
    await withTransaction(async (tx) => {
      const row = (await tx.query<{ id: string; removed: boolean; fullName: string }>(
        `SELECT e.id, (e."removedAt" IS NOT NULL) AS removed, a."fullName"
           FROM "RaffleEntry" e JOIN "Attendee" a ON a.id = e."attendeeId"
          WHERE e."packageId" = $1 AND e."attendeeId" = $2 FOR UPDATE OF e`,
        [packageId, attendeeId],
      )).rows[0];
      if (!row) throw new RaffleEntryError('Esa inscripción no existe.', 404);
      if (row.removed === removed) return; // ya estaba así: no se escribe nada
      if (removed) {
        await tx.query(`UPDATE "RaffleEntry" SET "removedAt" = ${NOW_UTC}, "removedById" = $2 WHERE id = $1`, [row.id, actorId]);
      } else {
        await tx.query(`UPDATE "RaffleEntry" SET "removedAt" = NULL, "removedById" = NULL WHERE id = $1`, [row.id]);
      }
      await tx.query(
        `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
         VALUES ($1, $2, $3, 'RaffleEntry', $4, $5::jsonb, ${NOW_UTC})`,
        [newId(), actorId, removed ? 'raffle.entry.remove' : 'raffle.entry.restore', row.id, JSON.stringify({ packageId, attendeeId, fullName: row.fullName })],
      );
    });
  } catch (err) {
    if (isMissing(err)) throw new RaffleEntryError('Quitar inscritos aún no está habilitado en esta base (falta la migración 018).', 409);
    throw err;
  }
  return listEntries();
}

import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { NOW_UTC, newId, query, withTransaction } from './db';
import { canEditDiscounts } from './teamDiscount';
import type {
  AdminRaffleDetail,
  AdminRafflesResponse,
  DrawRaffleResponse,
  PublicRaffle,
  RaffleStatus,
  RaffleSummary,
  RaffleWinnerRow,
} from '../shared/api';

/**
 * Rifas por kit (Bloque 4, migración 014).
 *
 * - El sorteo se hace AQUÍ, en el servidor, dentro de una transacción con la fila de la rifa bloqueada (FOR UPDATE):
 *   dos sorteos simultáneos de la misma rifa se ejecutan uno tras otro, nunca a la vez.
 * - Aleatoriedad: node:crypto randomInt (CSPRNG), sobre la lista de elegibles recalculada en ese instante.
 * - Elegible = asistente (no Staff/Admin: las pulseras del equipo no tienen "attendeeId") con pulsera ACTIVE del kit
 *   de la rifa que todavía no ganó en ESA rifa. Se revalida en cada sorteo; nada se calcula al cargar la página.
 * - Idempotencia: cada sorteo lleva un `drawKey` único que genera el navegador al presionar el botón. Un reintento o
 *   doble clic con la misma llave devuelve el ganador ya guardado y NO sortea otro. Lo respalda un UNIQUE en la base.
 * - "RaffleWinner" es solo-INSERT: no existe función que actualice, reinicie ni borre ganadores. Una edición nueva es
 *   una fila nueva en "Raffle", y la anterior queda como historial.
 */

export class RaffleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Administrar y sortear rifas solo lo pueden hacer las cuentas autorizadas (las mismas dos que editan descuentos:
 * DISCOUNT_EDITORS). Es la autorización REAL, en el servidor: ocultar el enlace del menú no protege nada por sí solo.
 * Otro Admin recibe 403 en las tres rutas /api/admin/raffle*. El proyector público (/rifa/:id) no se ve afectado.
 */
export const canManageRaffles = (email: string | null | undefined) => canEditDiscounts(email);
export const RAFFLE_FORBIDDEN = 'Esta sección solo está disponible para las cuentas autorizadas.';

const isMissingTable = (err: unknown) => (err as { code?: string })?.code === '42P01';
const NO_MIGRATION = 'Las rifas aún no están habilitadas en esta base (falta la migración 014).';
const NO_MIGRATION_016 = 'Cancelar rifas aún no está habilitado en esta base (falta la migración 016).';
const CANCELLED_MSG = 'La rifa fue cancelada: no se puede sortear, editar ni reabrir.';
/** Sin la migración 014 las rutas que reciben un id responden 409 con un mensaje claro (antes: error 500). */
async function orNoMigration<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isMissingTable(err)) throw new RaffleError(NO_MIGRATION, 409);
    throw err;
  }
}
export const DRAW_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_TARGET = 500;

type Db = Pick<pg.Pool | pg.PoolClient, 'query'>;

/** FROM + WHERE de los elegibles de una rifa. $1 = id del kit, $2 = id de la rifa. */
const ELIGIBLE_FROM = `
  FROM "Pulse" p
  JOIN "Attendee" a ON a.id = p."attendeeId"
 WHERE p.status = 'ACTIVE' AND p."packageId" = $1
   AND NOT EXISTS (SELECT 1 FROM "RaffleWinner" w WHERE w."raffleId" = $2 AND w."attendeeId" = a.id)`;

type RaffleRow = {
  id: string; packageId: string; kitName: string; edition: number; name: string;
  targetWinners: number; status: RaffleStatus; createdAt: string; winnersCount: number;
};

const SELECT_RAFFLE = `
  SELECT r.id, r."packageId", k.name AS "kitName", r.edition, r.name, r."targetWinners", r.status,
         to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
         (SELECT count(*)::int FROM "RaffleWinner" w WHERE w."raffleId" = r.id) AS "winnersCount"
    FROM "Raffle" r JOIN "Package" k ON k.id = r."packageId"`;

async function eligibleCount(db: Db, r: { id: string; packageId: string }): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(DISTINCT a.id)::int AS n ${ELIGIBLE_FROM}`, [r.packageId, r.id]);
  return rows[0]?.n ?? 0;
}

async function toSummary(db: Db, r: RaffleRow): Promise<RaffleSummary> {
  return { ...r, eligibleCount: await eligibleCount(db, r) };
}

async function winnersOf(db: Db, raffleId: string): Promise<RaffleWinnerRow[]> {
  const { rows } = await db.query<RaffleWinnerRow>(
    `SELECT w."position", w."attendeeId", w."winnerName", w.extra,
            to_char(w."drawnAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "drawnAt",
            w."drawnById", u.name AS "drawnByName"
       FROM "RaffleWinner" w LEFT JOIN "User" u ON u.id = w."drawnById"
      WHERE w."raffleId" = $1 ORDER BY w."position"`,
    [raffleId],
  );
  return rows;
}

async function loadRaffle(db: Db, id: string): Promise<RaffleRow | null> {
  if (!ID_RE.test(id)) return null;
  const { rows } = await db.query<RaffleRow>(`${SELECT_RAFFLE} WHERE r.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getAdminRaffleDetail(id: string, db: Db = { query: (t: string, p?: unknown[]) => query(t, p) } as Db): Promise<AdminRaffleDetail | null> {
  return orNoMigration(async () => {
    const r = await loadRaffle(db, id);
    if (!r) return null;
    return { ...(await toSummary(db, r)), winners: await winnersOf(db, id) };
  });
}

export async function listAdminRaffles(): Promise<AdminRafflesResponse> {
  const kits = (await query<{ id: string; name: string }>(`SELECT id, name FROM "Package" ORDER BY price, name`)).rows;
  try {
    const { rows } = await query<RaffleRow>(`${SELECT_RAFFLE} ORDER BY r."createdAt" DESC, r.id`);
    const raffles = await Promise.all(rows.map((r) => toSummary({ query } as unknown as Db, r)));
    return { available: true, raffles, kits };
  } catch (err) {
    if (isMissingTable(err)) return { available: false, raffles: [], kits };
    throw err;
  }
}

function checkTarget(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_TARGET) {
    throw new RaffleError(`El número de ganadores debe ser un entero entre 1 y ${MAX_TARGET}.`);
  }
  return v;
}

export async function createRaffle(actorId: string, input: { packageId: unknown; targetWinners: unknown; name?: unknown }): Promise<AdminRaffleDetail> {
  const target = checkTarget(input.targetWinners);
  if (typeof input.packageId !== 'string' || !ID_RE.test(input.packageId)) throw new RaffleError('Elige un kit válido.');
  let name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length > 80) throw new RaffleError('El nombre es demasiado largo (máximo 80 caracteres).');
  try {
    const id = await withTransaction(async (tx) => {
      const kit = (await tx.query<{ name: string }>(`SELECT name FROM "Package" WHERE id = $1 FOR SHARE`, [input.packageId])).rows[0];
      if (!kit) throw new RaffleError('Ese kit no existe.', 404);
      // Serializa la creación de ediciones del mismo kit.
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`raffle:${input.packageId}`]);
      const open = (await tx.query(`SELECT 1 FROM "Raffle" WHERE "packageId" = $1 AND status = 'OPEN' LIMIT 1`, [input.packageId])).rows.length;
      if (open) throw new RaffleError('Ese kit ya tiene una rifa abierta. Complétala antes de abrir una edición nueva.', 409);
      const edition = ((await tx.query<{ n: number }>(`SELECT COALESCE(max(edition), 0)::int + 1 AS n FROM "Raffle" WHERE "packageId" = $1`, [input.packageId])).rows[0]).n;
      if (!name) name = `Rifa ${kit.name} · Edición ${edition}`;
      const rid = newId();
      await tx.query(
        `INSERT INTO "Raffle" (id, "packageId", edition, name, "targetWinners", status, "createdAt", "createdById")
         VALUES ($1, $2, $3, $4, $5, 'OPEN', ${NOW_UTC}, $6)`,
        [rid, input.packageId, edition, name, target, actorId],
      );
      await tx.query(
        `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
         VALUES ($1, $2, 'raffle.create', 'Raffle', $3, $4::jsonb, ${NOW_UTC})`,
        [newId(), actorId, rid, JSON.stringify({ packageId: input.packageId, edition, targetWinners: target })],
      );
      return rid;
    });
    return (await getAdminRaffleDetail(id))!;
  } catch (err) {
    if (isMissingTable(err)) throw new RaffleError(NO_MIGRATION, 409);
    throw err;
  }
}

/** Cambia cuántos ganadores se buscan. Solo mientras la rifa está abierta y nunca por debajo de los ya sorteados. */
export async function updateTarget(actorId: string, id: string, targetWinners: unknown): Promise<AdminRaffleDetail> {
  const target = checkTarget(targetWinners);
  await orNoMigration(() => withTransaction(async (tx) => {
    const r = (await tx.query<{ status: RaffleStatus }>(`SELECT status FROM "Raffle" WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) throw new RaffleError('Esa rifa no existe.', 404);
    if (r.status === 'CANCELLED') throw new RaffleError(CANCELLED_MSG, 409);
    if (r.status !== 'OPEN') throw new RaffleError('La rifa ya está completada. Usa un sorteo extra autorizado o abre una edición nueva.', 409);
    const won = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM "RaffleWinner" WHERE "raffleId" = $1`, [id])).rows[0].n;
    if (target <= won) throw new RaffleError(`Ya hay ${won} ganador(es); el objetivo debe ser mayor para seguir sorteando.`);
    await tx.query(`UPDATE "Raffle" SET "targetWinners" = $2 WHERE id = $1`, [id, target]);
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'raffle.target', 'Raffle', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, id, JSON.stringify({ targetWinners: target })],
    );
  }));
  return (await getAdminRaffleDetail(id))!;
}

/**
 * Cancela una rifa ABIERTA (migración 016). Atómico y seguro ante solicitudes simultáneas: la fila se bloquea (FOR UPDATE), así que de
 * dos cancelaciones a la vez una gana y la otra recibe 409. No toca ganadores ni historial. Completada/cancelada: 409.
 * Sin la migración 016 (faltan las columnas) la transacción se deshace y responde 409, nunca 500.
 */
export async function cancelRaffle(actorId: string, id: string): Promise<AdminRaffleDetail> {
  if (!ID_RE.test(id)) throw new RaffleError('Esa rifa no existe.', 404);
  try {
    await orNoMigration(() => withTransaction(async (tx) => {
      const r = (await tx.query<{ status: RaffleStatus }>(`SELECT status FROM "Raffle" WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!r) throw new RaffleError('Esa rifa no existe.', 404);
      if (r.status === 'CANCELLED') throw new RaffleError('Esa rifa ya estaba cancelada.', 409);
      if (r.status !== 'OPEN') throw new RaffleError('Solo se puede cancelar una rifa abierta; esta ya está completada.', 409);
      await tx.query(`UPDATE "Raffle" SET status = 'CANCELLED', "cancelledAt" = ${NOW_UTC}, "cancelledById" = $2 WHERE id = $1 AND status = 'OPEN'`, [id, actorId]);
      const won = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM "RaffleWinner" WHERE "raffleId" = $1`, [id])).rows[0].n;
      await tx.query(
        `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
         VALUES ($1, $2, 'raffle.cancel', 'Raffle', $3, $4::jsonb, ${NOW_UTC})`,
        [newId(), actorId, id, JSON.stringify({ winnersKept: won })],
      );
    }));
  } catch (err) {
    if ((err as { code?: string })?.code === '42703' || (err as { code?: string })?.code === '23514') throw new RaffleError(NO_MIGRATION_016, 409);
    throw err;
  }
  return (await getAdminRaffleDetail(id))!;
}

/** Un sorteo. Idempotente por `drawKey`. Solo lo llama el endpoint de Admin. */
export async function drawWinner(actorId: string, id: string, input: { drawKey: unknown; extra?: unknown }): Promise<DrawRaffleResponse> {
  if (typeof input.drawKey !== 'string' || !DRAW_KEY_RE.test(input.drawKey)) throw new RaffleError('Falta la llave del sorteo (drawKey).');
  if (input.extra !== undefined && typeof input.extra !== 'boolean') throw new RaffleError('Solicitud inválida.');
  const drawKey = input.drawKey;
  const wantsExtra = input.extra === true;
  if (!ID_RE.test(id)) throw new RaffleError('Esa rifa no existe.', 404);

  const out = await orNoMigration(() => withTransaction(async (tx) => {
    const raffle = (await tx.query<{ id: string; packageId: string; targetWinners: number; status: RaffleStatus }>(
      `SELECT id, "packageId", "targetWinners", status FROM "Raffle" WHERE id = $1 FOR UPDATE`, [id],
    )).rows[0];
    if (!raffle) throw new RaffleError('Esa rifa no existe.', 404);

    if (raffle.status === 'CANCELLED') throw new RaffleError(CANCELLED_MSG, 409);

    // Reintento / doble clic / recarga con la misma llave: se devuelve el ganador ya guardado.
    const prev = (await tx.query<{ position: number }>(`SELECT "position" FROM "RaffleWinner" WHERE "raffleId" = $1 AND "drawKey" = $2`, [id, drawKey])).rows[0];
    if (prev) return { replay: true, position: prev.position };

    const won = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM "RaffleWinner" WHERE "raffleId" = $1`, [id])).rows[0].n;
    const reached = won >= raffle.targetWinners;
    if (reached && !wantsExtra) {
      throw new RaffleError('La rifa ya está completada. Para sortear otro ganador usa el sorteo extra autorizado.', 409);
    }
    if (!reached && wantsExtra) throw new RaffleError('Aún faltan ganadores por sortear: el sorteo extra solo aplica con la rifa completada.', 409);

    // Elegibles recalculados AHORA (orden estable por id para que randomInt sea el único azar).
    const eligible = (await tx.query<{ attendeeId: string; pulseId: string; fullName: string }>(
      `SELECT DISTINCT ON (a.id) a.id AS "attendeeId", p.id AS "pulseId", a."fullName" ${ELIGIBLE_FROM} ORDER BY a.id, p.id`,
      [raffle.packageId, id],
    )).rows;
    if (eligible.length === 0) throw new RaffleError('No hay participantes elegibles para sortear.', 409);

    const pick = eligible[randomInt(eligible.length)];
    const position = won + 1;
    await tx.query(
      `INSERT INTO "RaffleWinner" (id, "raffleId", "attendeeId", "pulseId", "position", "winnerName", extra, "drawKey", "drawnAt", "drawnById")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${NOW_UTC}, $9)`,
      [newId(), id, pick.attendeeId, pick.pulseId, position, pick.fullName, reached, drawKey, actorId],
    );
    if (!reached && position >= raffle.targetWinners) {
      await tx.query(`UPDATE "Raffle" SET status = 'COMPLETED', "completedAt" = ${NOW_UTC} WHERE id = $1`, [id]);
    }
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'raffle.draw', 'Raffle', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, id, JSON.stringify({ position, attendeeId: pick.attendeeId, extra: reached })],
    );
    return { replay: false, position };
  }));

  const detail = (await getAdminRaffleDetail(id))!;
  const winner = detail.winners.find((w) => w.position === out.position)!;
  return { replay: out.replay, winner, raffle: detail };
}

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'van', 'von']);
/**
 * Nombre para la vista PÚBLICA: primer nombre + inicial del primer apellido que sigue («Ana Asistente López» -> «Ana A.»).
 * Nunca se envían apellidos completos. Con una sola palabra se muestra tal cual.
 */
export function publicWinnerName(fullName: string): string {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  const next = parts.slice(1).find((w) => !PARTICLES.has(w.toLowerCase())) ?? parts[1];
  return `${parts[0]} ${next.charAt(0).toLocaleUpperCase('es-MX')}.`;
}

/** Vista pública (proyector). Solo nombres de ganadores y conteos; nunca la lista de participantes. */
export async function getPublicRaffle(id: string): Promise<PublicRaffle | null> {
  let r: RaffleRow | null;
  try {
    r = await loadRaffle({ query } as unknown as Db, id);
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
  if (!r) return null;
  const winners = (await winnersOf({ query } as unknown as Db, id)).map((w) => ({ position: w.position, name: publicWinnerName(w.winnerName), extra: w.extra }));
  return {
    id: r.id,
    name: r.name,
    kitName: r.kitName,
    edition: r.edition,
    status: r.status,
    targetWinners: r.targetWinners,
    winnersCount: r.winnersCount,
    remaining: await eligibleCount({ query } as unknown as Db, r),
    winners,
  };
}

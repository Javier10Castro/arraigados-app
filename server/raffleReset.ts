import { NOW_UTC, newId, query, withTransaction } from './db';
import { RaffleError } from './raffles';
import type { ResetRafflesResponse } from '../shared/api';

/**
 * REINICIAR RIFA (28 oct 2026, a pedido de coordinación): la ÚNICA forma de borrar rifas.
 *
 * Borra, para un kit (o para todos con packageId = 'ALL'):
 *   · las rifas de ese kit (abiertas, completadas o canceladas) y sus salidas/ganadores ("RaffleWinner");
 *   · todas las inscripciones con sus respuestas ("RaffleEntry"), incluidas las de personas quitadas.
 * Después, cualquiera con pulsera activa de ese kit puede volver a entrar respondiendo las 3 preguntas.
 *
 * - Exige escribir la palabra RESET_WORD (la valida el servidor; el navegador solo la pide).
 * - Una sola transacción. Toma el mismo candado por kit que crear una rifa y bloquea las filas de "Raffle" (FOR UPDATE):
 *   un sorteo o una rifa nueva al mismo tiempo esperan a que termine el borrado; nunca queda nada a medias.
 * - Queda en la auditoría (raffle.reset) con cuántas filas se borraron. NO cambia si las inscripciones están abiertas.
 * - No se puede deshacer: la pantalla recomienda descargar antes el CSV de inscritos.
 */
export const RESET_WORD = 'BORRAR';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

export async function resetRaffles(actorId: string, input: { packageId?: unknown; confirm?: unknown }): Promise<ResetRafflesResponse> {
  if (typeof input.confirm !== 'string' || norm(input.confirm) !== RESET_WORD) {
    throw new RaffleError(`Para reiniciar escribe: ${RESET_WORD}`);
  }
  const all = input.packageId === 'ALL';
  if (!all && (typeof input.packageId !== 'string' || !ID_RE.test(input.packageId))) throw new RaffleError('Elige un kit válido.');

  const kits = all
    ? (await query<{ id: string; name: string }>(`SELECT id, name FROM "Package" ORDER BY id`)).rows
    : (await query<{ id: string; name: string }>(`SELECT id, name FROM "Package" WHERE id = $1`, [input.packageId])).rows;
  if (kits.length === 0) throw new RaffleError('Ese kit no existe.', 404);
  const ids = kits.map((k) => k.id);

  try {
    return await withTransaction(async (tx) => {
      // Mismos candados que crear/sortear, en orden fijo (evita interbloqueos).
      for (const id of ids) await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`raffle:${id}`]);
      await tx.query(`SELECT id FROM "Raffle" WHERE "packageId" = ANY($1::text[]) ORDER BY id FOR UPDATE`, [ids]);
      const winners = (await tx.query(
        `DELETE FROM "RaffleWinner" WHERE "raffleId" IN (SELECT id FROM "Raffle" WHERE "packageId" = ANY($1::text[]))`, [ids],
      )).rowCount ?? 0;
      const raffles = (await tx.query(`DELETE FROM "Raffle" WHERE "packageId" = ANY($1::text[])`, [ids])).rowCount ?? 0;
      const entries = (await tx.query(`DELETE FROM "RaffleEntry" WHERE "packageId" = ANY($1::text[])`, [ids])).rowCount ?? 0;
      await tx.query(
        `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
         VALUES ($1, $2, 'raffle.reset', 'Raffle', $3, $4::jsonb, ${NOW_UTC})`,
        [newId(), actorId, all ? 'ALL' : ids[0], JSON.stringify({ kits: kits.map((k) => k.name), raffles, winners, entries })],
      );
      return { raffles, winners, entries };
    });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') throw new RaffleError('Las rifas aún no están habilitadas en esta base (faltan migraciones).', 409);
    throw err;
  }
}

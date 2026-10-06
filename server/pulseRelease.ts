import { NOW_UTC, withTransaction } from './db';

export class PulseReleaseError extends Error {}

export type ReleaseResult = { attendeeName: string; redemptions: number; notes: number };

/**
 * HERRAMIENTA DE PRUEBAS (solo la cuenta dueña, ver server/owner.ts). Desvincula una pulsera de su
 * asistente y la deja como recién creada (UNCLAIMED, sin dueño, sin canjes) para volver a probar el registro.
 *
 * - Borra al asistente con sus canjes, notas, likes y estado de notificaciones.
 * - Si tenía más pulseras (reemplazos), todas quedan sin dueño: la activa vuelve a UNCLAIMED y las
 *   deshabilitadas se quedan INVALIDATED.
 * - NO escribe en la bitácora (a propósito): no deja rastro.
 */
export async function releasePulse(pulseId: string): Promise<ReleaseResult> {
  return withTransaction(async (tx) => {
    const p = await tx.query<{ attendeeId: string | null }>(`SELECT "attendeeId" FROM "Pulse" WHERE id = $1 FOR UPDATE`, [pulseId]);
    if (!p.rowCount) throw new PulseReleaseError('Esa pulsera ya no existe.');
    const attendeeId = p.rows[0].attendeeId;
    if (!attendeeId) throw new PulseReleaseError('Esa pulsera no está vinculada a nadie.');

    const att = await tx.query<{ fullName: string }>(`SELECT "fullName" FROM "Attendee" WHERE id = $1`, [attendeeId]);
    const has = async (t: string) => Boolean((await tx.query(`SELECT to_regclass($1) AS t`, [`public."${t}"`])).rows[0].t);

    let notes = 0;
    if (await has('Note')) {
      if (await has('NoteLike')) {
        await tx.query(
          `DELETE FROM "NoteLike" WHERE "attendeeId" = $1 OR "noteId" IN (SELECT id FROM "Note" WHERE "attendeeId" = $1)`,
          [attendeeId],
        );
      }
      notes = (await tx.query(`DELETE FROM "Note" WHERE "attendeeId" = $1`, [attendeeId])).rowCount ?? 0;
    }
    if (await has('NotificationState')) await tx.query(`DELETE FROM "NotificationState" WHERE "attendeeId" = $1`, [attendeeId]);
    const redemptions = (await tx.query(`DELETE FROM "Redemption" WHERE "attendeeId" = $1`, [attendeeId])).rowCount ?? 0;

    const ids = (await tx.query<{ id: string }>(`SELECT id FROM "Pulse" WHERE "attendeeId" = $1`, [attendeeId])).rows.map((r) => r.id);
    const hasSelfRef = Boolean(
      (await tx.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'Pulse' AND column_name = 'replacesId'`)).rowCount,
    );
    if (hasSelfRef) await tx.query(`UPDATE "Pulse" SET "replacesId" = NULL WHERE "replacesId" = ANY($1::text[])`, [ids]);
    // La activa vuelve a "recién creada".
    await tx.query(
      `UPDATE "Pulse" SET status = 'UNCLAIMED', "attendeeId" = NULL, "claimedAt" = NULL, "drinksUsed" = 0, "updatedAt" = ${NOW_UTC}
        WHERE "attendeeId" = $1 AND status = 'ACTIVE'`,
      [attendeeId],
    );
    // Las deshabilitadas siguen deshabilitadas, solo sin dueño.
    await tx.query(`UPDATE "Pulse" SET "attendeeId" = NULL, "updatedAt" = ${NOW_UTC} WHERE "attendeeId" = $1`, [attendeeId]);
    await tx.query(`DELETE FROM "Attendee" WHERE id = $1`, [attendeeId]);

    return { attendeeName: att.rows[0]?.fullName ?? '', redemptions, notes };
  });
}

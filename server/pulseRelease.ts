import { withTransaction } from './db';

export class PulseReleaseError extends Error {}

export type ReleaseResult = { attendeeName: string; redemptions: number; notes: number };

/**
 * HERRAMIENTA DE PRUEBAS (solo la cuenta dueña, ver server/owner.ts). Deja la pulsera EXACTAMENTE como
 * recién creada: sin dueño, sin canjes y sin ningún rastro de haberse usado.
 *
 * - Borra al asistente con sus canjes, notas, likes y estado de notificaciones.
 * - Si tenía más pulseras (reemplazos), todas quedan sin dueño: la activa vuelve a UNCLAIMED
 *   (updatedAt = createdAt, como al imprimirse) y las deshabilitadas se quedan INVALIDATED.
 * - Borra también de la bitácora todo lo que hablaba de ese asistente, sus pulseras, canjes y notas
 *   (registro, correcciones, anulaciones, reemplazos, notas retiradas).
 * - NO escribe nada en la bitácora.
 */
export async function releasePulse(pulseId: string): Promise<ReleaseResult> {
  return withTransaction(async (tx) => {
    const p = await tx.query<{ attendeeId: string | null }>(`SELECT "attendeeId" FROM "Pulse" WHERE id = $1 FOR UPDATE`, [pulseId]);
    if (!p.rowCount) throw new PulseReleaseError('Esa pulsera ya no existe.');
    const attendeeId = p.rows[0].attendeeId;
    if (!attendeeId) throw new PulseReleaseError('Esa pulsera no está vinculada a nadie.');

    const att = await tx.query<{ fullName: string }>(`SELECT "fullName" FROM "Attendee" WHERE id = $1`, [attendeeId]);
    const has = async (t: string) => Boolean((await tx.query(`SELECT to_regclass($1) AS t`, [`public."${t}"`])).rows[0].t);
    const ids = async (sql: string) => (await tx.query<{ id: string }>(sql, [attendeeId])).rows.map((r) => r.id);

    // Ids que luego hay que buscar en la bitácora (antes de borrarlos).
    const pulseIds = await ids(`SELECT id FROM "Pulse" WHERE "attendeeId" = $1`);
    const redemptionIds = await ids(`SELECT id FROM "Redemption" WHERE "attendeeId" = $1`);
    const hasNotes = await has('Note');
    const noteIds = hasNotes ? await ids(`SELECT id FROM "Note" WHERE "attendeeId" = $1`) : [];

    let notes = 0;
    if (hasNotes) {
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

    const hasSelfRef = Boolean(
      (await tx.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'Pulse' AND column_name = 'replacesId'`)).rowCount,
    );
    if (hasSelfRef) {
      await tx.query(`UPDATE "Pulse" SET "replacesId" = NULL WHERE "replacesId" IN (SELECT id FROM "Pulse" WHERE "attendeeId" = $1)`, [attendeeId]);
      await tx.query(`UPDATE "Pulse" SET "replacesId" = NULL WHERE "attendeeId" = $1`, [attendeeId]);
    }
    // La activa vuelve a "recién creada" (updatedAt = createdAt, como cuando se imprimió).
    await tx.query(
      `UPDATE "Pulse" SET status = 'UNCLAIMED', "attendeeId" = NULL, "claimedAt" = NULL, "drinksUsed" = 0, "updatedAt" = "createdAt"
        WHERE "attendeeId" = $1 AND status = 'ACTIVE'`,
      [attendeeId],
    );
    // Las deshabilitadas siguen deshabilitadas, solo sin dueño.
    await tx.query(`UPDATE "Pulse" SET "attendeeId" = NULL WHERE "attendeeId" = $1`, [attendeeId]);
    await tx.query(`DELETE FROM "Attendee" WHERE id = $1`, [attendeeId]);

    // Sin rastro en la bitácora: todo lo que mencione a este asistente, sus pulseras, canjes o notas.
    const entityIds = [attendeeId, ...pulseIds, ...redemptionIds, ...noteIds];
    await tx.query(
      `DELETE FROM "AuditLog"
        WHERE "entityId" = ANY($1::text[])
           OR metadata->>'attendeeId' = $2
           OR metadata->>'oldPulseId' = ANY($3::text[])
           OR metadata->>'pulseId' = ANY($3::text[])`,
      [entityIds, attendeeId, pulseIds],
    );

    return { attendeeName: att.rows[0]?.fullName ?? '', redemptions, notes };
  });
}

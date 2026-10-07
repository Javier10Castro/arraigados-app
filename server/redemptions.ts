import { EVENT_TIMEZONE, parsePageSize, pulseCodeLabel, type AdminRedemptionFilters, type AdminRedemptionRow, type AdminRedemptionsCatalog, type AdminRedemptionsResponse, type RedemptionStatus, type VoidRedemptionResponse } from '../shared/api';
import { NOW_UTC, newId, query, withTransaction } from './db';

/**
 * Admin -> Canjes (Etapa 6, parte Admin). Lee las tablas existentes
 * ("Redemption", "Pulse", "Attendee", "Package", "User", "AuditLog"); NO hay
 * cambios de esquema (ver nota en shared/api.ts junto a `RedemptionStatus`).
 *
 * "Anular" un canje:
 * 1. Nunca se borra ni se modifica la fila de "Redemption" (es el historial).
 * 2. Queda "ANULADO" agregando una fila en "AuditLog" con
 *    action = 'redemption.void', igual patrón que pulse.reassign y
 *    attendee.update ya usan para dejar rastro de una acción de Admin/Staff.
 * 3. El beneficio (agua) se devuelve descontando `quantity` del
 *    "drinksUsed" de la pulsera ACTIVA actual del asistente (puede no ser la
 *    misma pulsera del canje original, si hubo un reemplazo de por medio;
 *    ver `restoreBenefit`).
 */

const TZ = EVENT_TIMEZONE;
const local = (col: string) => `((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`;
const unaccent = (expr: string) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;

type Row = {
  id: string;
  createdAt: string;
  attendeeId: string;
  attendeeName: string;
  pulseCode: string;
  packageName: string;
  quantity: number;
  staffId: string;
  staffName: string;
  voidedAtRaw: string | null;
  voidedByName: string | null;
  voidReason: string | null;
};

function toRow(r: Row): AdminRedemptionRow {
  const status: RedemptionStatus = r.voidedAtRaw ? 'ANULADO' : 'VALIDO';
  return {
    id: r.id,
    createdAt: r.createdAt,
    attendeeId: r.attendeeId,
    attendeeName: r.attendeeName,
    pulseLabel: pulseCodeLabel(r.pulseCode),
    packageName: r.packageName,
    quantity: r.quantity,
    staffId: r.staffId,
    staffName: r.staffName,
    status,
    voidedAt: r.voidedAtRaw,
    voidedByName: r.voidedByName,
    voidReason: r.voidReason,
  };
}

/* ------------------------------------------------------------------ */
/* Lista + filtros (todo en el servidor, misma receta que Asistentes)   */
/* ------------------------------------------------------------------ */

export async function listRedemptions(f: AdminRedemptionFilters): Promise<AdminRedemptionsResponse> {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };

  const words = String(f.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const w of words) add((n) => `${unaccent('a."fullName"')} LIKE ${unaccent(`$${n}`)}`, `%${w}%`);
  if (f.manualCode) add((n) => `p."manualCode" ILIKE $${n}`, `%${f.manualCode}%`);
  if (f.staffId) add((n) => `r."createdById" = $${n}`, f.staffId);
  if (f.from) add((n) => `${local('r."createdAt"')} >= $${n}::date`, f.from);
  if (f.to) add((n) => `${local('r."createdAt"')} < ($${n}::date + 1)`, f.to);
  // status: depende de si existe (o no) el AuditLog de anulación -- se
  // filtra con HAVING/EXISTS en vez del WHERE de arriba (necesita el join lateral).
  const statusHaving =
    f.status === 'ANULADO'
      ? `v."createdAt" IS NOT NULL`
      : f.status === 'VALIDO'
        ? `v."createdAt" IS NULL`
        : null;

  const from = `
    FROM "Redemption" r
    JOIN "Attendee" a ON a.id = r."attendeeId"
    JOIN "Pulse" p ON p.id = r."pulseId"
    JOIN "Package" k ON k.id = r."packageId"
    JOIN "User" u ON u.id = r."createdById"
    LEFT JOIN LATERAL (
      SELECT al."actorId", al."createdAt", al.metadata->>'reason' AS reason
        FROM "AuditLog" al
       WHERE al."entityType" = 'Redemption' AND al."entityId" = r.id AND al.action = 'redemption.void'
       ORDER BY al."createdAt" ASC
       LIMIT 1
    ) v ON true
    LEFT JOIN "User" vu ON vu.id = v."actorId"
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ${statusHaving ? `${where.length ? 'AND' : 'WHERE'} ${statusHaving}` : ''}`;

  const total = (await query<{ n: number }>(`SELECT count(*)::int AS n ${from}`, params)).rows[0].n;
  const pageSize = parsePageSize(f.pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const page = Math.min(lastPage, Math.max(0, Math.floor(Number(f.page) || 0)));

  const { rows } = await query<Row>(
    `SELECT r.id, to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            r."attendeeId", a."fullName" AS "attendeeName", p."manualCode" AS "pulseCode",
            k.name AS "packageName", r.quantity, r."createdById" AS "staffId", u.name AS "staffName",
            to_char(v."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "voidedAtRaw", vu.name AS "voidedByName", v.reason AS "voidReason"
       ${from}
      ORDER BY r."createdAt" DESC, r.id DESC
      LIMIT ${pageSize} OFFSET ${page * pageSize}`,
    params,
  );
  return { total, page, pageSize, rows: rows.map(toRow) };
}

/** Catálogo del filtro "Staff": solo quienes ya hicieron al menos un canje. */
export async function redemptionsCatalog(): Promise<AdminRedemptionsCatalog> {
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT DISTINCT u.id, u.name
       FROM "Redemption" r JOIN "User" u ON u.id = r."createdById"
      ORDER BY u.name`,
  );
  return { staff: rows };
}

/* ------------------------------------------------------------------ */
/* Anulación                                                            */
/* ------------------------------------------------------------------ */

export class RedemptionVoidError extends Error {}

/**
 * Anula un canje (nunca lo borra) y devuelve el beneficio.
 *
 * Transaccional y seguro ante dos solicitudes simultáneas sobre el MISMO
 * canje: `SELECT ... FOR UPDATE` bloquea la fila de "Redemption" durante
 * toda la operación, así que la segunda solicitud espera a que la primera
 * termine (COMMIT) y entonces encuentra el AuditLog ya escrito y responde
 * "already_voided" -- nunca se anula ni se devuelve el beneficio dos veces.
 */
export async function voidRedemption(id: string, actorId: string, reason: string): Promise<VoidRedemptionResponse> {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new RedemptionVoidError('El motivo es obligatorio.');
  if (cleanReason.length > 500) throw new RedemptionVoidError('El motivo es demasiado largo (máximo 500 caracteres).');

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      attendeeId: string;
      pulseId: string;
      quantity: number;
    }>(`SELECT id, "attendeeId", "pulseId", quantity FROM "Redemption" WHERE id = $1 FOR UPDATE`, [id]);
    const redemption = rows[0];
    if (!redemption) return { outcome: 'not_found' as const };

    // Ya anulado (por esta misma solicitud repetida, o por otra que ganó la carrera).
    const already = await tx.query(
      `SELECT 1 FROM "AuditLog" WHERE "entityType" = 'Redemption' AND "entityId" = $1 AND action = 'redemption.void' LIMIT 1`,
      [id],
    );
    if (already.rowCount) return { outcome: 'already_voided' as const };

    // Pulsera a la que se le devuelve el beneficio: de preferencia la del
    // canje original SI sigue activa; si ya no (reemplazo de pulsera de por
    // medio), la pulsera ACTIVA actual del mismo asistente. Si no hay
    // ninguna pulsera activa, se anula igual pero no hay dónde restaurar
    // (caso raro, documentado en docs/CLAUDE_HANDOFF.md).
    const target = await tx.query<{ id: string }>(
      // ORDER BY (id = $1) DESC: si la pulsera del canje original sigue
      // activa, gana ella; si no, cualquier otra pulsera ACTIVE del mismo
      // asistente (a lo más una existe, por el índice único de Neon).
      `SELECT id FROM "Pulse" WHERE status = 'ACTIVE' AND (id = $1 OR "attendeeId" = $2)
        ORDER BY (id = $1) DESC
        LIMIT 1`,
      [redemption.pulseId, redemption.attendeeId],
    );
    const targetPulseId = target.rows[0]?.id ?? null;
    let restored = false;
    if (targetPulseId) {
      await tx.query(
        `UPDATE "Pulse" SET "drinksUsed" = GREATEST("drinksUsed" - $2, 0), "updatedAt" = ${NOW_UTC} WHERE id = $1`,
        [targetPulseId, redemption.quantity],
      );
      restored = true;
    }

    const who = (await tx.query<{ fullName: string }>(`SELECT "fullName" FROM "Attendee" WHERE id = $1`, [redemption.attendeeId])).rows[0];
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'redemption.void', 'Redemption', $3, $4::jsonb, ${NOW_UTC})`,
      [
        newId(),
        actorId,
        id,
        JSON.stringify({
          reason: cleanReason,
          attendeeId: redemption.attendeeId,
          attendeeName: who?.fullName ?? null,
          originalPulseId: redemption.pulseId,
          restoredPulseId: targetPulseId,
          quantity: redemption.quantity,
          restored,
        }),
      ],
    );
    return { outcome: 'ok' as const, restored };
  });
}

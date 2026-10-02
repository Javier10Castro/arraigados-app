import { NOW_UTC, newId, query, withTransaction } from './db';
import {
  QR_TOKEN_RE,
  normalizeStaffCode,
  pulseCodeLabel,
  type ReassignResponse,
  type RedeemResponse,
  type RedemptionStatus,
  type StaffHistoryResponse,
  type StaffPulseResponse,
  type StaffSearchResult,
} from '../shared/api';

/**
 * Lógica de Staff sobre las tablas existentes de Neon. Réplica de
 * src/lib/pulses.ts (búsqueda/escaneo) y src/lib/redemptions.ts (canje) del
 * Next.js. Si allá cambia una regla, cambiarla aquí también.
 */

type PulseRow = {
  id: string;
  manualCode: string;
  status: 'UNCLAIMED' | 'ACTIVE' | 'INVALIDATED';
  attendeeId: string | null;
  packageId: string;
  drinksUsed: number;
  packageName: string;
  includedDrinks: number;
  fullName: string | null;
  churchName: string | null;
  presbyteryName: string | null;
  zoneName: string | null;
};

const PULSE_SELECT = `
  SELECT p.id, p."manualCode", p.status::text AS status, p."attendeeId", p."packageId", p."drinksUsed",
         k.name AS "packageName", k."includedDrinks",
         a."fullName", c.name AS "churchName", pr.name AS "presbyteryName", z.name AS "zoneName"
    FROM "Pulse" p
    JOIN "Package" k ON k.id = p."packageId"
    LEFT JOIN "Attendee" a ON a.id = p."attendeeId"
    LEFT JOIN "Church" c ON c.id = a."churchId"
    LEFT JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
    LEFT JOIN "Zone" z ON z.id = pr."zoneId"`;

const remaining = (r: { includedDrinks: number; drinksUsed: number }) => Math.max(r.includedDrinks - r.drinksUsed, 0);

/** Pulsera por token del QR o por código de respaldo, con todos sus datos para el modal. */
export async function lookupPulse(by: { token?: string; code?: string }): Promise<StaffPulseResponse> {
  let row: PulseRow | undefined;
  if (by.token !== undefined) {
    if (!QR_TOKEN_RE.test(by.token)) return { status: 'not_found' };
    row = (await query<PulseRow>(`${PULSE_SELECT} WHERE p."qrToken" = $1`, [by.token])).rows[0];
  } else {
    // AR26-XXXXX o QRONLY:<qrToken> (pulseras de Lotes): ver shared/api.ts.
    const code = normalizeStaffCode(by.code);
    if (!code) return { status: 'not_found' };
    row = (await query<PulseRow>(`${PULSE_SELECT} WHERE p."manualCode" = $1`, [code])).rows[0];
  }
  if (!row) return { status: 'not_found' };
  if (row.status === 'INVALIDATED') return { status: 'invalidated', manualCode: row.manualCode };
  if (row.status === 'UNCLAIMED' || !row.fullName) {
    return { status: 'unclaimed', manualCode: row.manualCode, packageName: row.packageName };
  }
  return {
    status: 'active',
    manualCode: row.manualCode,
    attendee: {
      fullName: row.fullName,
      churchName: row.churchName ?? '',
      presbyteryName: row.presbyteryName ?? '',
      zoneName: row.zoneName ?? '',
    },
    package: { name: row.packageName, includedDrinks: row.includedDrinks },
    drinksUsed: row.drinksUsed,
    drinksRemaining: remaining(row),
  };
}

/**
 * Búsqueda de asistentes para Staff (cuando el QR no se puede escanear):
 * por nombre (parcial, sin distinguir mayúsculas ni acentos) y/o iglesia.
 * Solo pulseras ACTIVAS, como en el Next.js.
 */
export async function searchActive(q: string, churchId: string): Promise<StaffSearchResult[]> {
  const name = q.trim();
  if (name.length < 2 && !churchId) return [];
  const params: unknown[] = [];
  const where = [`p.status = 'ACTIVE'`];
  if (name.length >= 2) {
    // Comparación sin acentos usando translate (sin extensiones nuevas en la base).
    params.push(`%${name}%`);
    where.push(
      `translate(lower(a."fullName"), 'áéíóúüñ', 'aeiouun') LIKE translate(lower($${params.length}), 'áéíóúüñ', 'aeiouun')`,
    );
  }
  if (churchId) {
    params.push(churchId);
    where.push(`a."churchId" = $${params.length}`);
  }
  const { rows } = await query<PulseRow>(
    `${PULSE_SELECT} WHERE ${where.join(' AND ')} ORDER BY a."fullName" ASC LIMIT 25`,
    params,
  );
  return rows.map((r) => ({
    manualCode: r.manualCode,
    fullName: r.fullName ?? '',
    churchName: r.churchName ?? '',
    packageName: r.packageName,
    includedDrinks: r.includedDrinks,
    drinksRemaining: remaining(r),
  }));
}

class InsufficientBalanceRace extends Error {}

/**
 * Canje de 1 agua fresca (redeemDrinks del Next.js, quantity = 1):
 * 1. Misma idempotencyKey ya procesada -> "already_processed", no descuenta.
 * 2. Pulsera no activa -> "pulse_not_active".
 * 3. Sin saldo -> "insufficient_balance".
 * 4. Transacción: UPDATE condicional (solo si drinksUsed + 1 <= includedDrinks)
 *    + INSERT en Redemption con createdById = Staff de la sesión.
 *    Dos canjes simultáneos nunca pueden pasar del límite; la llave única de
 *    idempotencyKey atrapa la carrera de dos envíos idénticos.
 * location queda vacío por decisión (Fase 2): la zona/presbiterio/iglesia se
 * obtiene del asistente; "location" se reserva para la sede de entrega.
 */
export async function redeemOne(manualCode: string, idempotencyKey: string, staffId: string): Promise<RedeemResponse> {
  const key = String(idempotencyKey ?? '');
  if (key.length < 8 || key.length > 100) throw new Error('Solicitud de canje inválida.');
  const quantity = 1;

  const existing = await query<{ includedDrinks: number; drinksUsed: number }>(
    `SELECT k."includedDrinks", p."drinksUsed"
       FROM "Redemption" r JOIN "Pulse" p ON p.id = r."pulseId" JOIN "Package" k ON k.id = p."packageId"
      WHERE r."idempotencyKey" = $1`,
    [key],
  );
  if (existing.rows[0]) return { outcome: 'already_processed', drinksRemaining: remaining(existing.rows[0]) };

  const code = normalizeStaffCode(manualCode);
  if (!code) return { outcome: 'pulse_not_active' };
  const pulse = (await query<PulseRow>(`${PULSE_SELECT} WHERE p."manualCode" = $1`, [code])).rows[0];
  if (!pulse || pulse.status !== 'ACTIVE' || !pulse.attendeeId) return { outcome: 'pulse_not_active' };
  if (remaining(pulse) < quantity) return { outcome: 'insufficient_balance', drinksRemaining: remaining(pulse) };

  try {
    const drinksRemaining = await withTransaction(async (tx) => {
      const update = await tx.query<{ drinksUsed: number; includedDrinks: number }>(
        `UPDATE "Pulse" p
            SET "drinksUsed" = p."drinksUsed" + $2, "updatedAt" = ${NOW_UTC}
           FROM "Package" k
          WHERE p.id = $1 AND k.id = p."packageId" AND p.status = 'ACTIVE'
            AND p."drinksUsed" + $2 <= k."includedDrinks"
          RETURNING p."drinksUsed", k."includedDrinks"`,
        [pulse.id, quantity],
      );
      if (update.rowCount === 0) throw new InsufficientBalanceRace();
      await tx.query(
        `INSERT INTO "Redemption" (id, "attendeeId", "pulseId", "packageId", quantity, location, "idempotencyKey", "createdById", "createdAt")
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, ${NOW_UTC})`,
        [newId(), pulse.attendeeId, pulse.id, pulse.packageId, quantity, key, staffId],
      );
      return remaining(update.rows[0]);
    });
    return { outcome: 'ok', drinksRemaining };
  } catch (err) {
    if (err instanceof InsufficientBalanceRace) {
      const fresh = await lookupPulse({ code });
      return {
        outcome: 'insufficient_balance',
        drinksRemaining: fresh.status === 'active' ? fresh.drinksRemaining : 0,
      };
    }
    // Dos envíos con la MISMA llave a la vez: la llave única los atrapa.
    if ((err as { code?: string })?.code === '23505') {
      const fresh = await lookupPulse({ code });
      return { outcome: 'already_processed', drinksRemaining: fresh.status === 'active' ? fresh.drinksRemaining : 0 };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Reemplazo de pulsera                                                 */
/* ------------------------------------------------------------------ */

/**
 * Reemplaza la pulsera de un asistente (pulsera perdida o dañada).
 * Réplica de src/lib/reassign.ts del Next.js con UNA diferencia decidida el
 * 1 oct 2026: las aguas frescas ya canjeadas se CONSERVAN (la nueva hereda
 * "drinksUsed"); el Next.js las reiniciaba a 0, lo que permitía "perder" la
 * pulsera para volver a pedir aguas.
 *
 * Reglas:
 * - La actual debe estar ACTIVE con asistente.
 * - La nueva debe existir, estar UNCLAIMED y ser del MISMO kit (packageId).
 * - Todo en una transacción, con las dos filas bloqueadas (FOR UPDATE):
 *   1) la actual pasa a INVALIDATED primero (libera el índice único parcial
 *      pulse_one_active_per_attendee), 2) la nueva queda ACTIVE para el mismo
 *      asistente, con replacesId = la actual y el mismo drinksUsed,
 *   3) AuditLog "pulse.reassign".
 * - El historial de canjes (Redemption) se queda ligado a la pulsera vieja.
 * - Repetir la misma petición (doble toque) responde ok sin hacer nada más.
 */
export async function reassignPulse(manualCode: string, newToken: string, staffId: string): Promise<ReassignResponse> {
  const code = normalizeStaffCode(manualCode);
  const token = String(newToken ?? '').trim();
  if (!code) return { outcome: 'old_not_active' };
  if (!QR_TOKEN_RE.test(token)) return { outcome: 'new_not_found' };

  type Row = {
    id: string;
    manualCode: string;
    qrToken: string;
    status: 'UNCLAIMED' | 'ACTIVE' | 'INVALIDATED';
    attendeeId: string | null;
    packageId: string;
    packageName: string;
    includedDrinks: number;
    drinksUsed: number;
    replacesId: string | null;
  };

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<Row>(
      `SELECT p.id, p."manualCode", p."qrToken", p.status::text AS status, p."attendeeId", p."packageId",
              k.name AS "packageName", k."includedDrinks", p."drinksUsed", p."replacesId"
         FROM "Pulse" p JOIN "Package" k ON k.id = p."packageId"
        WHERE p."manualCode" = $1 OR p."qrToken" = $2
        ORDER BY p.id
          FOR UPDATE OF p`,
      [code, token],
    );
    const old = rows.find((r) => r.manualCode === code);
    const next = rows.find((r) => r.qrToken === token);
    if (!next) return { outcome: 'new_not_found' as const };
    if (!old) return { outcome: 'old_not_active' as const };
    if (old.id === next.id) return { outcome: 'same_pulse' as const };

    // Doble toque: ya se hizo este mismo reemplazo.
    if (old.status === 'INVALIDATED' && next.status === 'ACTIVE' && next.replacesId === old.id) {
      return {
        outcome: 'ok' as const,
        newCode: next.manualCode,
        drinksUsed: next.drinksUsed,
        drinksRemaining: Math.max(next.includedDrinks - next.drinksUsed, 0),
      };
    }
    if (old.status !== 'ACTIVE' || !old.attendeeId) return { outcome: 'old_not_active' as const };
    if (next.status !== 'UNCLAIMED') {
      return { outcome: 'new_not_available' as const, status: next.status === 'ACTIVE' ? 'active' : 'invalidated' };
    }
    if (next.packageId !== old.packageId) {
      return { outcome: 'different_kit' as const, oldKit: old.packageName, newKit: next.packageName };
    }

    await tx.query(
      `UPDATE "Pulse" SET status = 'INVALIDATED', "updatedAt" = ${NOW_UTC} WHERE id = $1 AND status = 'ACTIVE'`,
      [old.id],
    );
    const drinksUsed = Math.min(old.drinksUsed, next.includedDrinks);
    await tx.query(
      `UPDATE "Pulse"
          SET status = 'ACTIVE', "attendeeId" = $2, "claimedAt" = ${NOW_UTC}, "drinksUsed" = $3,
              "replacesId" = $4, "updatedAt" = ${NOW_UTC}
        WHERE id = $1 AND status = 'UNCLAIMED'`,
      [next.id, old.attendeeId, drinksUsed, old.id],
    );
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'pulse.reassign', 'Pulse', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), staffId, next.id, JSON.stringify({ oldPulseId: old.id, attendeeId: old.attendeeId, drinksUsed })],
    );
    return {
      outcome: 'ok' as const,
      newCode: next.manualCode,
      drinksUsed,
      drinksRemaining: Math.max(next.includedDrinks - drinksUsed, 0),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Historial propio de Staff (Etapa 3)                                  */
/* ------------------------------------------------------------------ */

/**
 * "Mis canjes recientes" de /staff: SOLO los canjes hechos por `staffId`
 * (el id sale de la sesión verificada en el servidor -- ver
 * netlify/functions/staff-history.mts -- nunca de un parámetro de la
 * petición). Mismo cálculo de `status` (ANULADO = existe un AuditLog
 * "redemption.void" para ese canje) que Admin -> Canjes (server/redemptions.ts),
 * para que anular un canje en Admin se refleje aquí también.
 */
export async function staffHistory(staffId: string, limit = 20): Promise<StaffHistoryResponse> {
  type Row = {
    id: string;
    createdAt: string;
    attendeeName: string;
    pulseCode: string;
    quantity: number;
    voidedAtRaw: string | null;
  };
  const { rows } = await query<Row>(
    `SELECT r.id, to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            a."fullName" AS "attendeeName", p."manualCode" AS "pulseCode", r.quantity,
            to_char(v."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "voidedAtRaw"
       FROM "Redemption" r
       JOIN "Attendee" a ON a.id = r."attendeeId"
       JOIN "Pulse" p ON p.id = r."pulseId"
       LEFT JOIN LATERAL (
         SELECT al."createdAt"
           FROM "AuditLog" al
          WHERE al."entityType" = 'Redemption' AND al."entityId" = r.id AND al.action = 'redemption.void'
          ORDER BY al."createdAt" ASC
          LIMIT 1
       ) v ON true
      WHERE r."createdById" = $1
      ORDER BY r."createdAt" DESC
      LIMIT $2`,
    [staffId, limit],
  );
  return {
    rows: rows.map((r) => {
      const status: RedemptionStatus = r.voidedAtRaw ? 'ANULADO' : 'VALIDO';
      return {
        id: r.id,
        createdAt: r.createdAt,
        attendeeName: r.attendeeName,
        pulseLabel: pulseCodeLabel(r.pulseCode),
        quantity: r.quantity,
        status,
      };
    }),
  };
}

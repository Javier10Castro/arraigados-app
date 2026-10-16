import type pg from 'pg';
import { NOW_UTC, newId, query, withTransaction } from './db';
import { getBenefitLabels } from './benefits';
import { selfRedeemDecision } from './selfRedeem';
import {
  normalizeStaffCode,
  pulseCodeLabel,
  type AdminStaffPulseInfo,
  type StaffMeResponse,
  type StaffPulseLinkResponse,
  type StaffPulseUnlinkResponse,
  type StaffRole,
} from '../shared/api';

/**
 * Pulseras de cuentas del EQUIPO (Staff/Admin). Ver migrations/012_staff_selfredeem.sql.
 *
 * Reglas (todas se validan aquí, en el servidor, y las clave están además en la base):
 *  · SOLO un Admin autorizado vincula / reemplaza / desvincula (los endpoints llaman authorize(['ADMIN'])).
 *  · Una cuenta tiene a lo más UNA pulsera vigente y una pulsera pertenece a lo más a UNA cuenta
 *    (índices únicos parciales de "StaffPulse"; la carrera entre dos Admin la gana uno y el otro recibe un resultado claro).
 *  · Solo se puede vincular una pulsera UNCLAIMED y sin asistente. Nunca se le quita una pulsera a un asistente
 *    (una pulsera con "attendeeId" jamás pasa) ni se roba una vinculada a otra cuenta.
 *  · La pulsera vinculada queda ACTIVE con "attendeeId" NULL: por eso el registro normal (claimPulse solo actúa
 *    sobre UNCLAIMED) no puede reclamarla, y un trigger de la base lo impide aunque otra ruta lo intentara.
 *  · NO se crea ningún Attendee.
 *  · Cada vinculación, reemplazo y desvinculación deja un AuditLog SIN tokens ni códigos (solo ids y la etiqueta
 *    corta "AR26-XXXXX" / "QR abcd…").
 *
 * Orden de bloqueos (evita bloqueos mutuos): primero la cuenta (FOR NO KEY UPDATE: no choca con la FK de los canjes),
 * luego las pulseras ordenadas por id.
 */

type Tx = pg.PoolClient;
type Outcome<T> = T;

const isPgError = (err: unknown, code: string) => (err as { code?: string } | null)?.code === code;

type PulseRow = {
  id: string;
  manualCode: string;
  status: 'UNCLAIMED' | 'ACTIVE' | 'INVALIDATED';
  attendeeId: string | null;
  packageId: string;
  packageName: string;
  includedDrinks: number;
  drinksUsed: number;
};

const PULSE_COLS = `p.id, p."manualCode", p.status::text AS status, p."attendeeId", p."packageId", k.name AS "packageName", k."includedDrinks", p."drinksUsed"`;

async function audit(tx: Tx, actorId: string, action: string, pulseId: string, meta: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
     VALUES ($1, $2, $3, 'Pulse', $4, $5::jsonb, ${NOW_UTC})`,
    [newId(), actorId, action, pulseId, JSON.stringify(meta)],
  );
}

/** Por qué una pulsera no se puede tomar (siempre bajo el bloqueo de su fila). */
async function unavailableReason(tx: Tx, p: PulseRow): Promise<'pulse_invalidated' | 'pulse_linked' | 'pulse_in_use' | null> {
  if (p.status === 'INVALIDATED') return 'pulse_invalidated';
  if (p.status === 'ACTIVE' || p.attendeeId) {
    const linked = await tx.query(`SELECT 1 FROM "StaffPulse" WHERE "pulseId" = $1 AND "unlinkedAt" IS NULL`, [p.id]);
    return linked.rowCount ? 'pulse_linked' : 'pulse_in_use';
  }
  return null;
}

async function lockUser(tx: Tx, userId: string) {
  return (
    await tx.query<{ id: string; name: string; role: StaffRole; active: boolean }>(
      `SELECT id, name, role::text AS role, active FROM "User" WHERE id = $1 FOR NO KEY UPDATE`,
      [userId],
    )
  ).rows[0];
}

/** Clasifica un error de la base en un resultado de negocio (carrera con otro Admin / trigger de defensa). */
function mapConflict(err: unknown): StaffPulseLinkResponse | null {
  if (isPgError(err, '23505')) {
    const c = String((err as { constraint?: string }).constraint ?? '');
    if (c.includes('active_user')) return { outcome: 'user_has_pulse' };
    return { outcome: 'pulse_linked' };
  }
  if (isPgError(err, '23514')) return { outcome: 'pulse_in_use' };
  return null;
}

/* ------------------------------------------------------------------ */
/* Vincular                                                             */
/* ------------------------------------------------------------------ */

export async function linkStaffPulse(actorId: string, userId: string, rawCode: unknown): Promise<StaffPulseLinkResponse> {
  const code = normalizeStaffCode(rawCode);
  if (!code) return { outcome: 'pulse_not_found' };
  try {
    return await withTransaction<Outcome<StaffPulseLinkResponse>>(async (tx) => {
      const user = await lockUser(tx, String(userId ?? ''));
      if (!user) return { outcome: 'user_not_found' };
      if (!user.active) return { outcome: 'user_inactive' };

      const p = (
        await tx.query<PulseRow>(
          `SELECT ${PULSE_COLS} FROM "Pulse" p JOIN "Package" k ON k.id = p."packageId" WHERE p."manualCode" = $1 FOR UPDATE OF p`,
          [code],
        )
      ).rows[0];
      if (!p) return { outcome: 'pulse_not_found' };
      const bad = await unavailableReason(tx, p);
      if (bad) return { outcome: bad };

      const mine = await tx.query(`SELECT 1 FROM "StaffPulse" WHERE "userId" = $1 AND "unlinkedAt" IS NULL`, [user.id]);
      if (mine.rowCount) return { outcome: 'user_has_pulse' };

      const upd = await tx.query(
        `UPDATE "Pulse" SET status = 'ACTIVE', "claimedAt" = ${NOW_UTC}, "drinksUsed" = 0, "updatedAt" = ${NOW_UTC}
          WHERE id = $1 AND status = 'UNCLAIMED' AND "attendeeId" IS NULL`,
        [p.id],
      );
      if (upd.rowCount === 0) return { outcome: 'pulse_in_use' };
      await tx.query(
        `INSERT INTO "StaffPulse" (id, "userId", "pulseId", "linkedById", "createdAt") VALUES ($1, $2, $3, $4, ${NOW_UTC})`,
        [newId(), user.id, p.id, actorId],
      );
      const label = pulseCodeLabel(p.manualCode);
      await audit(tx, actorId, 'staffpulse.link', p.id, { userId: user.id, memberName: user.name, role: user.role, label, kit: p.packageName });
      return { outcome: 'ok', pulseLabel: label, packageName: p.packageName, drinksRemaining: p.includedDrinks };
    });
  } catch (err) {
    const mapped = mapConflict(err);
    if (mapped) return mapped;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Desvincular                                                          */
/* ------------------------------------------------------------------ */

/**
 * Cierra el vínculo vigente. La pulsera vuelve a circulación (UNCLAIMED) SOLO si nunca se usó (sin aguas canjeadas y
 * sin ningún canje); si tiene historial queda INVALIDATED, para que ese historial no pase a otra persona.
 */
export async function unlinkStaffPulse(actorId: string, userId: string): Promise<StaffPulseUnlinkResponse> {
  return withTransaction<StaffPulseUnlinkResponse>(async (tx) => {
    const user = await lockUser(tx, String(userId ?? ''));
    if (!user) return { outcome: 'user_not_found' };
    const link = (await tx.query<{ id: string; pulseId: string }>(`SELECT id, "pulseId" FROM "StaffPulse" WHERE "userId" = $1 AND "unlinkedAt" IS NULL`, [user.id])).rows[0];
    if (!link) return { outcome: 'no_link' };

    const p = (await tx.query<PulseRow>(`SELECT ${PULSE_COLS} FROM "Pulse" p JOIN "Package" k ON k.id = p."packageId" WHERE p.id = $1 FOR UPDATE OF p`, [link.pulseId])).rows[0];
    await tx.query(`UPDATE "StaffPulse" SET "unlinkedAt" = ${NOW_UTC}, "unlinkedById" = $2 WHERE id = $1`, [link.id, actorId]);

    let pulse: 'released' | 'invalidated' = 'invalidated';
    if (p && p.status === 'ACTIVE') {
      const used = await tx.query(`SELECT 1 FROM "Redemption" WHERE "pulseId" = $1 LIMIT 1`, [p.id]);
      if (p.drinksUsed === 0 && !used.rowCount) {
        await tx.query(`UPDATE "Pulse" SET status = 'UNCLAIMED', "claimedAt" = NULL, "updatedAt" = ${NOW_UTC} WHERE id = $1`, [p.id]);
        pulse = 'released';
      } else {
        await tx.query(`UPDATE "Pulse" SET status = 'INVALIDATED', "updatedAt" = ${NOW_UTC} WHERE id = $1`, [p.id]);
      }
    }
    await audit(tx, actorId, 'staffpulse.unlink', link.pulseId, {
      userId: user.id,
      memberName: user.name,
      role: user.role,
      label: p ? pulseCodeLabel(p.manualCode) : null,
      pulse,
    });
    return { outcome: 'ok', pulse };
  });
}

/* ------------------------------------------------------------------ */
/* Reemplazar                                                           */
/* ------------------------------------------------------------------ */

/**
 * Cambia la pulsera de la cuenta por otra NUEVA del MISMO kit (mismo criterio que reassignPulse de los asistentes):
 * la anterior queda INVALIDATED, la nueva ACTIVE conservando las aguas ya canjeadas, y el historial de canjes se queda
 * ligado a la pulsera vieja. Todo en una transacción.
 */
export async function replaceStaffPulse(actorId: string, userId: string, rawCode: unknown): Promise<StaffPulseLinkResponse> {
  const code = normalizeStaffCode(rawCode);
  if (!code) return { outcome: 'pulse_not_found' };
  try {
    return await withTransaction<StaffPulseLinkResponse>(async (tx) => {
      const user = await lockUser(tx, String(userId ?? ''));
      if (!user) return { outcome: 'user_not_found' };
      if (!user.active) return { outcome: 'user_inactive' };
      const link = (await tx.query<{ id: string; pulseId: string }>(`SELECT id, "pulseId" FROM "StaffPulse" WHERE "userId" = $1 AND "unlinkedAt" IS NULL`, [user.id])).rows[0];
      if (!link) return { outcome: 'no_link' };

      const nextId = (await tx.query<{ id: string }>(`SELECT id FROM "Pulse" WHERE "manualCode" = $1`, [code])).rows[0]?.id;
      if (!nextId) return { outcome: 'pulse_not_found' };
      if (nextId === link.pulseId) return { outcome: 'same_pulse' };

      const locked = (
        await tx.query<PulseRow>(
          `SELECT ${PULSE_COLS} FROM "Pulse" p JOIN "Package" k ON k.id = p."packageId" WHERE p.id = ANY($1::text[]) ORDER BY p.id FOR UPDATE OF p`,
          [[link.pulseId, nextId]],
        )
      ).rows;
      const old = locked.find((r) => r.id === link.pulseId);
      const next = locked.find((r) => r.id === nextId);
      if (!old || !next) return { outcome: 'pulse_not_found' };
      const bad = await unavailableReason(tx, next);
      if (bad) return { outcome: bad };
      if (next.packageId !== old.packageId) return { outcome: 'different_kit', oldKit: old.packageName, newKit: next.packageName };

      const drinksUsed = Math.min(old.drinksUsed, next.includedDrinks);
      await tx.query(`UPDATE "StaffPulse" SET "unlinkedAt" = ${NOW_UTC}, "unlinkedById" = $2 WHERE id = $1`, [link.id, actorId]);
      await tx.query(`UPDATE "Pulse" SET status = 'INVALIDATED', "updatedAt" = ${NOW_UTC} WHERE id = $1 AND status = 'ACTIVE'`, [old.id]);
      const upd = await tx.query(
        `UPDATE "Pulse" SET status = 'ACTIVE', "claimedAt" = ${NOW_UTC}, "drinksUsed" = $2, "replacesId" = $3, "updatedAt" = ${NOW_UTC}
          WHERE id = $1 AND status = 'UNCLAIMED' AND "attendeeId" IS NULL`,
        [next.id, drinksUsed, old.id],
      );
      if (upd.rowCount === 0) return { outcome: 'pulse_in_use' };
      await tx.query(
        `INSERT INTO "StaffPulse" (id, "userId", "pulseId", "linkedById", "createdAt") VALUES ($1, $2, $3, $4, ${NOW_UTC})`,
        [newId(), user.id, next.id, actorId],
      );
      await audit(tx, actorId, 'staffpulse.replace', next.id, {
        userId: user.id,
        memberName: user.name,
        role: user.role,
        oldPulseId: old.id,
        oldLabel: pulseCodeLabel(old.manualCode),
        label: pulseCodeLabel(next.manualCode),
        drinksUsed,
      });
      return { outcome: 'ok', pulseLabel: pulseCodeLabel(next.manualCode), packageName: next.packageName, drinksRemaining: Math.max(next.includedDrinks - drinksUsed, 0) };
    });
  } catch (err) {
    const mapped = mapConflict(err);
    if (mapped) return mapped;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Consultas                                                            */
/* ------------------------------------------------------------------ */

/** Admin -> Usuarios: ¿qué pulsera tiene esta cuenta? */
export async function getStaffPulseInfo(userId: string): Promise<AdminStaffPulseInfo> {
  const { rows } = await query<{ manualCode: string; status: 'UNCLAIMED' | 'ACTIVE' | 'INVALIDATED'; packageName: string; includedDrinks: number; drinksUsed: number; since: string }>(
    `SELECT p."manualCode", p.status::text AS status, k.name AS "packageName", k."includedDrinks", p."drinksUsed",
            to_char(sp."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS since
       FROM "StaffPulse" sp JOIN "Pulse" p ON p.id = sp."pulseId" JOIN "Package" k ON k.id = p."packageId"
      WHERE sp."userId" = $1 AND sp."unlinkedAt" IS NULL`,
    [userId],
  );
  const r = rows[0];
  if (!r) return { linked: false };
  return {
    linked: true,
    pulseLabel: pulseCodeLabel(r.manualCode),
    pulseStatus: r.status,
    packageName: r.packageName,
    includedDrinks: r.includedDrinks,
    drinksUsed: r.drinksUsed,
    since: r.since,
  };
}

/**
 * GET /api/staff-me: la pulsera PROPIA. El `userId` y el rol salen SIEMPRE de la sesión verificada (el endpoint no acepta
 * ningún identificador del cliente), así que nadie puede consultar la pulsera de otra cuenta.
 */
export async function getStaffMe(user: { id: string; name: string; role: StaffRole }): Promise<StaffMeResponse> {
  const { rows } = await query<{ status: string; drinksUsed: number; packageId: string; packageName: string; price: number; includedDrinks: number }>(
    `SELECT p.status::text AS status, p."drinksUsed", k.id AS "packageId", k.name AS "packageName", k.price, k."includedDrinks"
       FROM "StaffPulse" sp JOIN "Pulse" p ON p.id = sp."pulseId" JOIN "Package" k ON k.id = p."packageId"
      WHERE sp."userId" = $1 AND sp."unlinkedAt" IS NULL`,
    [user.id],
  );
  const r = rows[0];
  if (!r) return { state: 'none' };
  if (r.status !== 'ACTIVE') return { state: 'invalid' };
  const benefits = await getBenefitLabels(r.packageId); // null = migración 008 sin aplicar
  const decision = await selfRedeemDecision(query, user.id, user.role);
  return {
    state: 'active',
    member: { id: user.id, name: user.name, role: user.role },
    package: { name: r.packageName, price: r.price, includedDrinks: r.includedDrinks, ...(benefits ? { benefits } : {}) },
    drinksUsed: r.drinksUsed,
    drinksRemaining: Math.max(r.includedDrinks - r.drinksUsed, 0),
    selfRedeemAllowed: decision.allowed,
  };
}

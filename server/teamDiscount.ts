import { NOW_UTC, newId, query, withTransaction } from './db';
import type {
  DiscountRole,
  DiscountType,
  TeamDiscountKitRow,
  TeamDiscountRule,
  TeamDiscountSummary,
} from '../shared/api';

/**
 * Descuentos del equipo e ingresos SIMULADOS (Bloque 3, migración 013).
 *
 * - Es una SIMULACIÓN para el Dashboard: no cobra, no crea pagos, no toca "Package", "Redemption", saldos ni precios.
 * - Equipo = cuenta STAFF/ADMIN activa con una pulsera ACTIVE vinculada de forma vigente ("StaffPulse", migración 012).
 *   Una persona cuenta una sola vez (índice único parcial por cuenta). Los asistentes NO son equipo: su pulsera
 *   tiene "attendeeId" (un trigger de 012 impide que una pulsera tenga ambos).
 * - Dinero siempre en CENTAVOS ENTEROS (igual que "Package"."price"). El porcentaje se guarda en puntos base
 *   (12.5 % = 1250), el monto fijo en centavos (MXN 50 = 5000).
 * - Escribir la configuración solo lo pueden hacer los correos de DISCOUNT_EDITORS, comparados contra el usuario de
 *   la SESIÓN (nunca contra un correo enviado por el navegador).
 */

export class TeamDiscountError extends Error {}

/** Únicas cuentas que pueden modificar los descuentos. Cualquier otro Admin solo los ve. */
export const DISCOUNT_EDITORS: readonly string[] = ['javiercastro9912@gmail.com', 'perlarivera@redjuveniltijuana.com'];

export const canEditDiscounts = (email: string | null | undefined) =>
  typeof email === 'string' && DISCOUNT_EDITORS.includes(email.trim().toLowerCase());

export const MAX_FIXED_MXN = 100_000;

/** Descuento en centavos: nunca negativo y nunca mayor al precio normal. `value` = bps (percent) o centavos (fixed). */
export function discountCents(priceCents: number, type: DiscountType, value: number): number {
  const price = Number.isFinite(priceCents) ? Math.max(0, Math.trunc(priceCents)) : 0;
  const v = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  const raw = type === 'percent' ? Math.round((price * Math.min(v, 10_000)) / 10_000) : v;
  return Math.min(price, Math.max(0, raw));
}

/** Convierte lo que escribe la persona (% o pesos, hasta 2 decimales) al entero que se guarda. */
export function parseAmount(type: unknown, amount: unknown): { type: DiscountType; value: number } {
  if (type !== 'percent' && type !== 'fixed') throw new TeamDiscountError('Tipo de descuento inválido.');
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TeamDiscountError('Escribe un número válido.');
  if (amount < 0) throw new TeamDiscountError('El descuento no puede ser negativo.');
  const scaled = Math.round(amount * 100);
  if (Math.abs(amount * 100 - scaled) > 1e-6) throw new TeamDiscountError('Usa máximo 2 decimales.');
  if (type === 'percent' && amount > 100) throw new TeamDiscountError('El porcentaje no puede pasar de 100 %.');
  if (type === 'fixed' && amount > MAX_FIXED_MXN) throw new TeamDiscountError(`El monto fijo no puede pasar de $${MAX_FIXED_MXN} MXN.`);
  return { type, value: scaled }; // percent -> bps; fixed -> centavos (ambos = amount × 100)
}

type Stored = { type: DiscountType; value: number };
const ZERO: Record<DiscountRole, Stored> = { STAFF: { type: 'percent', value: 0 }, ADMIN: { type: 'percent', value: 0 } };

const toRule = (s: Stored): TeamDiscountRule => ({ type: s.type, amount: s.value / 100, active: s.value > 0 });

/** Código de Postgres para "tabla inexistente": migración pendiente. */
const isMissingTable = (err: unknown) => (err as { code?: string })?.code === '42P01';

type PackageRow = { id: string; name: string; price: number; active: boolean };
type CountByKit = Map<string, number>;

/** Pura (sin base de datos): arma el resumen. Es lo que prueban los tests de fórmulas. */
export function buildSummary(
  packages: PackageRow[],
  attendees: CountByKit,
  staff: CountByKit,
  admin: CountByKit,
  config: Record<DiscountRole, Stored>,
): Pick<TeamDiscountSummary, 'totals' | 'byKit'> {
  const byKit: TeamDiscountKitRow[] = [];
  for (const p of packages) {
    const a = attendees.get(p.id) ?? 0;
    const st = staff.get(p.id) ?? 0;
    const ad = admin.get(p.id) ?? 0;
    if (!p.active && a + st + ad === 0) continue;
    const dStaff = discountCents(p.price, config.STAFF.type, config.STAFF.value);
    const dAdmin = discountCents(p.price, config.ADMIN.type, config.ADMIN.value);
    const attendeeRevenueCents = a * p.price;
    const teamNormalCents = (st + ad) * p.price;
    const discount = st * dStaff + ad * dAdmin;
    const teamSimulatedCents = teamNormalCents - discount;
    byKit.push({
      packageId: p.id, name: p.name, priceCents: p.price, attendees: a, staff: st, admin: ad,
      attendeeRevenueCents, teamNormalCents, teamSimulatedCents, discountCents: discount,
      combinedCents: attendeeRevenueCents + teamSimulatedCents,
    });
  }
  const sum = (f: (r: TeamDiscountKitRow) => number) => byKit.reduce((n, r) => n + f(r), 0);
  return {
    byKit,
    totals: {
      attendees: sum((r) => r.attendees),
      staff: sum((r) => r.staff),
      admin: sum((r) => r.admin),
      team: sum((r) => r.staff + r.admin),
      attendeeRevenueCents: sum((r) => r.attendeeRevenueCents),
      teamNormalCents: sum((r) => r.teamNormalCents),
      teamSimulatedCents: sum((r) => r.teamSimulatedCents),
      discountCents: sum((r) => r.discountCents),
      combinedCents: sum((r) => r.combinedCents),
    },
  };
}

async function readConfig(): Promise<{ config: Record<DiscountRole, Stored>; available: boolean }> {
  try {
    const { rows } = await query<{ role: DiscountRole; type: DiscountType; value: number }>(
      `SELECT "role", "type", "value" FROM "TeamDiscountSetting"`,
    );
    const config = { STAFF: { ...ZERO.STAFF }, ADMIN: { ...ZERO.ADMIN } };
    for (const r of rows) if (r.role === 'STAFF' || r.role === 'ADMIN') config[r.role] = { type: r.type, value: r.value };
    return { config, available: true };
  } catch (err) {
    if (isMissingTable(err)) return { config: { STAFF: { ...ZERO.STAFF }, ADMIN: { ...ZERO.ADMIN } }, available: false };
    throw err;
  }
}

async function readTeamCounts(): Promise<{ staff: CountByKit; admin: CountByKit; available: boolean }> {
  const staff: CountByKit = new Map();
  const admin: CountByKit = new Map();
  try {
    const { rows } = await query<{ packageId: string; role: string; n: number }>(
      `SELECT p."packageId", u.role::text AS role, count(DISTINCT u.id)::int AS n
         FROM "StaffPulse" sp
         JOIN "Pulse" p ON p.id = sp."pulseId" AND p.status = 'ACTIVE' AND p."attendeeId" IS NULL
         JOIN "User" u  ON u.id = sp."userId" AND u.active AND u.role::text IN ('STAFF', 'ADMIN')
        WHERE sp."unlinkedAt" IS NULL
        GROUP BY 1, 2`,
    );
    for (const r of rows) (r.role === 'ADMIN' ? admin : staff).set(r.packageId, r.n);
    return { staff, admin, available: true };
  } catch (err) {
    if (isMissingTable(err)) return { staff, admin, available: false };
    throw err;
  }
}

export async function getTeamDiscountSummary(viewerEmail: string): Promise<TeamDiscountSummary> {
  const [cfg, team, pk, at] = await Promise.all([
    readConfig(),
    readTeamCounts(),
    query<PackageRow>(`SELECT id, name, price, active FROM "Package" ORDER BY price, name`),
    // Asistente = pulsera ACTIVE con "attendeeId". Las pulseras del equipo nunca tienen "attendeeId".
    query<{ packageId: string; n: number }>(
      `SELECT p."packageId", count(*)::int AS n FROM "Pulse" p
        WHERE p.status = 'ACTIVE' AND p."attendeeId" IS NOT NULL GROUP BY 1`,
    ),
  ]);
  const attendees: CountByKit = new Map(at.rows.map((r) => [r.packageId, r.n]));
  const { totals, byKit } = buildSummary(pk.rows, attendees, team.staff, team.admin, cfg.config);
  return {
    rules: { STAFF: toRule(cfg.config.STAFF), ADMIN: toRule(cfg.config.ADMIN) },
    canEdit: canEditDiscounts(viewerEmail),
    configAvailable: cfg.available,
    teamAvailable: team.available,
    totals,
    byKit,
  };
}

/** Solo lo llama el endpoint, después de authorize(['ADMIN']). Revalida el permiso con el correo de la SESIÓN. */
export async function setTeamDiscount(
  actor: { id: string; email: string },
  input: { role: unknown; type: unknown; amount: unknown },
): Promise<void> {
  if (!canEditDiscounts(actor.email)) throw new TeamDiscountForbidden();
  if (input.role !== 'STAFF' && input.role !== 'ADMIN') throw new TeamDiscountError('Rol inválido.');
  const role: DiscountRole = input.role;
  const { type, value } = parseAmount(input.type, input.amount);
  const cfg = await readConfig();
  if (!cfg.available) throw new TeamDiscountError('La configuración de descuentos aún no está habilitada (falta la migración 013).');
  const previous = cfg.config[role];
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO "TeamDiscountSetting" ("role", "type", "value", "updatedAt", "updatedById")
       VALUES ($1, $2, $3, ${NOW_UTC}, $4)
       ON CONFLICT ("role") DO UPDATE SET "type" = EXCLUDED."type", "value" = EXCLUDED."value",
         "updatedAt" = EXCLUDED."updatedAt", "updatedById" = EXCLUDED."updatedById"`,
      [role, type, value, actor.id],
    );
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'teamDiscount.update', 'TeamDiscount', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actor.id, role, JSON.stringify({ type, value, previous })],
    );
  });
}

export class TeamDiscountForbidden extends Error {
  constructor() {
    super('Solo las cuentas autorizadas pueden modificar los descuentos.');
  }
}

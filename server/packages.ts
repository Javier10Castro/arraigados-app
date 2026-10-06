import { query } from './db';
import { listBenefitsAdmin } from './benefits';
import type { AdminKitRow, AdminKitsResponse } from '../shared/api';

/**
 * Admin -> Kits (solo lectura). Una fila por kit con sus números en vivo. No escribe nada.
 * Los kits son fijos (no se editan desde la app): aquí solo se revisan.
 */
export async function listKitsAdmin(): Promise<AdminKitsResponse> {
  const { rows } = await query<{
    id: string;
    name: string;
    price: number;
    includedDrinks: number;
    active: boolean;
    total: number;
    unclaimed: number;
    activePulses: number;
    invalidated: number;
    used: number;
  }>(
    `SELECT k.id, k.name, k.price, k."includedDrinks", k.active,
            count(p.id)::int AS total,
            count(p.id) FILTER (WHERE p.status::text = 'UNCLAIMED')::int AS unclaimed,
            count(p.id) FILTER (WHERE p.status::text = 'ACTIVE')::int AS "activePulses",
            count(p.id) FILTER (WHERE p.status::text = 'INVALIDATED')::int AS invalidated,
            COALESCE(sum(LEAST(p."drinksUsed", k."includedDrinks")) FILTER (WHERE p.status::text = 'ACTIVE'), 0)::int AS used
       FROM "Package" k
       LEFT JOIN "Pulse" p ON p."packageId" = k.id
      GROUP BY k.id, k.name, k.price, k."includedDrinks", k.active
      ORDER BY k.price ASC, k.name ASC`,
  );
  const ben = await listBenefitsAdmin();
  const kits: AdminKitRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price,
    includedDrinks: r.includedDrinks,
    active: r.active,
    benefits: ben.kits.find((b) => b.id === r.id)?.benefits.map((b) => b.label) ?? [],
    pulses: { total: r.total, unclaimed: r.unclaimed, active: r.activePulses, invalidated: r.invalidated },
    drinks: { included: r.includedDrinks * r.activePulses, used: r.used },
    expectedIncome: r.price * r.activePulses,
  }));
  return {
    kits,
    totals: {
      total: kits.reduce((n, k) => n + k.pulses.total, 0),
      active: kits.reduce((n, k) => n + k.pulses.active, 0),
      expectedIncome: kits.reduce((n, k) => n + k.expectedIncome, 0),
    },
  };
}

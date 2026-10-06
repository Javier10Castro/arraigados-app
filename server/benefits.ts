import { NOW_UTC, newId, query, withTransaction } from './db';
import type { AdminBenefitsResponse, AdminKitBenefits } from '../shared/api';

/**
 * Beneficios de cada kit (tabla "PackageBenefit", migración 008). Es la lista "Incluye" que ve el
 * asistente en /beneficios y en su Home; la administra el Admin en /admin/beneficios.
 *
 * Reglas: el texto no se repite dentro del mismo kit (sin importar mayúsculas ni acentos); el orden
 * es el que ve el asistente (se sube/baja un lugar); todo cambio queda en "AuditLog".
 * Las "aguas frescas" NO son un beneficio de esta tabla: salen de Package."includedDrinks".
 * Si la migración aún no está aplicada, la app usa la lista fija de siempre (data/app.ts).
 */

export const BENEFIT_LABEL_MAX = 80;
export const BENEFITS_PER_KIT_MAX = 20;

export class BenefitError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function cleanLabel(raw: unknown): string {
  const label = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (label.length < 2) throw new BenefitError('Escribe el beneficio (mínimo 2 letras).');
  if (label.length > BENEFIT_LABEL_MAX) throw new BenefitError(`Máximo ${BENEFIT_LABEL_MAX} caracteres.`);
  return label;
}

/** Lista "Incluye" del kit para el asistente; null si la tabla aún no existe (migración sin aplicar). */
export async function getBenefitLabels(packageId: string): Promise<string[] | null> {
  try {
    const { rows } = await query<{ label: string }>(
      `SELECT "label" FROM "PackageBenefit" WHERE "packageId" = $1 ORDER BY "sortOrder", "createdAt", "id"`,
      [packageId],
    );
    return rows.map((r) => r.label);
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return null;
    throw err;
  }
}

export async function listBenefitsAdmin(): Promise<AdminBenefitsResponse> {
  const kits = await query<Omit<AdminKitBenefits, 'benefits'>>(
    `SELECT id, name, price, "includedDrinks", active FROM "Package" ORDER BY price ASC, name ASC`,
  );
  let rows: { id: string; packageId: string; label: string }[] = [];
  let ready = true;
  try {
    rows = (
      await query<{ id: string; packageId: string; label: string }>(
        `SELECT id, "packageId", "label" FROM "PackageBenefit" ORDER BY "sortOrder", "createdAt", "id"`,
      )
    ).rows;
  } catch (err) {
    if ((err as { code?: string })?.code !== '42P01') throw err;
    ready = false;
  }
  return {
    ready,
    labelMax: BENEFIT_LABEL_MAX,
    perKitMax: BENEFITS_PER_KIT_MAX,
    kits: kits.rows.map((k) => ({
      ...k,
      benefits: rows.filter((r) => r.packageId === k.id).map((r) => ({ id: r.id, label: r.label })),
    })),
  };
}

const audit = (tx: { query: (t: string, v?: unknown[]) => Promise<unknown> }, actorId: string, action: string, id: string, meta: unknown) =>
  tx.query(
    `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
     VALUES ($1, $2, $3, 'PackageBenefit', $4, $5::jsonb, ${NOW_UTC})`,
    [newId(), actorId, action, id, JSON.stringify(meta)],
  );

export async function createBenefit(actorId: string, packageId: unknown, rawLabel: unknown): Promise<{ id: string }> {
  const label = cleanLabel(rawLabel);
  return withTransaction(async (tx) => {
    const pkg = await tx.query<{ name: string }>(`SELECT name FROM "Package" WHERE id = $1 FOR UPDATE`, [String(packageId ?? '')]);
    if (!pkg.rows[0]) throw new BenefitError('Ese kit no existe.', 404);
    const cur = await tx.query<{ label: string; sortOrder: number }>(
      `SELECT "label", "sortOrder" FROM "PackageBenefit" WHERE "packageId" = $1`,
      [String(packageId)],
    );
    if (cur.rows.length >= BENEFITS_PER_KIT_MAX) throw new BenefitError(`Un kit puede tener máximo ${BENEFITS_PER_KIT_MAX} beneficios.`);
    if (cur.rows.some((r) => norm(r.label) === norm(label))) throw new BenefitError('Ese beneficio ya está en este kit.', 409);
    const id = newId();
    const next = cur.rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
    await tx.query(
      `INSERT INTO "PackageBenefit" (id, "packageId", "label", "sortOrder", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, ${NOW_UTC}, ${NOW_UTC})`,
      [id, packageId, label, next],
    );
    await audit(tx, actorId, 'benefit.create', id, { kit: pkg.rows[0].name, label });
    return { id };
  });
}

export async function updateBenefit(actorId: string, id: string, rawLabel: unknown): Promise<void> {
  const label = cleanLabel(rawLabel);
  await withTransaction(async (tx) => {
    const cur = await tx.query<{ label: string; packageId: string; kit: string }>(
      `SELECT b."label", b."packageId", p.name AS kit FROM "PackageBenefit" b JOIN "Package" p ON p.id = b."packageId"
        WHERE b.id = $1 FOR UPDATE OF b`,
      [id],
    );
    const row = cur.rows[0];
    if (!row) throw new BenefitError('Ese beneficio ya no existe.', 404);
    if (row.label === label) return;
    const clash = await tx.query<{ label: string }>(`SELECT "label" FROM "PackageBenefit" WHERE "packageId" = $1 AND id <> $2`, [row.packageId, id]);
    if (clash.rows.some((r) => norm(r.label) === norm(label))) throw new BenefitError('Ese beneficio ya está en este kit.', 409);
    await tx.query(`UPDATE "PackageBenefit" SET "label" = $1, "updatedAt" = ${NOW_UTC} WHERE id = $2`, [label, id]);
    await audit(tx, actorId, 'benefit.update', id, { kit: row.kit, label: { from: row.label, to: label } });
  });
}

export async function deleteBenefit(actorId: string, id: string): Promise<void> {
  await withTransaction(async (tx) => {
    const cur = await tx.query<{ label: string; kit: string }>(
      `SELECT b."label", p.name AS kit FROM "PackageBenefit" b JOIN "Package" p ON p.id = b."packageId" WHERE b.id = $1 FOR UPDATE OF b`,
      [id],
    );
    const row = cur.rows[0];
    if (!row) throw new BenefitError('Ese beneficio ya no existe.', 404);
    await tx.query(`DELETE FROM "PackageBenefit" WHERE id = $1`, [id]);
    await audit(tx, actorId, 'benefit.delete', id, { kit: row.kit, label: row.label });
  });
}

/** Sube (-1) o baja (+1) un beneficio un lugar dentro de su kit. Renumera 0..n-1 para evitar empates. */
export async function moveBenefit(actorId: string, id: string, dir: -1 | 1): Promise<void> {
  await withTransaction(async (tx) => {
    const cur = await tx.query<{ packageId: string; kit: string; label: string }>(
      `SELECT b."packageId", p.name AS kit, b."label" FROM "PackageBenefit" b JOIN "Package" p ON p.id = b."packageId" WHERE b.id = $1`,
      [id],
    );
    const row = cur.rows[0];
    if (!row) throw new BenefitError('Ese beneficio ya no existe.', 404);
    await tx.query(`SELECT id FROM "Package" WHERE id = $1 FOR UPDATE`, [row.packageId]); // serializa movimientos del mismo kit
    const list = (
      await tx.query<{ id: string }>(`SELECT id FROM "PackageBenefit" WHERE "packageId" = $1 ORDER BY "sortOrder", "createdAt", id`, [row.packageId])
    ).rows.map((r) => r.id);
    const i = list.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return; // ya está en el extremo
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) {
      await tx.query(`UPDATE "PackageBenefit" SET "sortOrder" = $1 WHERE id = $2`, [k, list[k]]);
    }
    await audit(tx, actorId, 'benefit.move', id, { kit: row.kit, label: row.label, dir: dir === -1 ? 'arriba' : 'abajo' });
  });
}

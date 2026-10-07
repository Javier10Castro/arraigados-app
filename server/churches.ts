import type { PoolClient } from 'pg';
import { NOW_UTC, newId, query, withTransaction } from './db';
import { deriveCity } from '../shared/churches';
import type { AdminChurchRow, AdminChurchesResponse, AdminPresbyteryOption, ChurchInput } from '../shared/api';

/**
 * Admin → Iglesias (tablas "Church" → "Presbytery" → "Zone" de Neon).
 *
 * Reglas:
 * - Neon ya es la fuente de verdad (las 109 iglesias vienen del Excel oficial); aquí solo se
 *   administran las IGLESIAS. Presbiterios y zonas son de solo lectura: no hay endpoints para tocarlos.
 * - Una iglesia pertenece a UN solo presbiterio; la zona sale del presbiterio (Presbytery.zoneId).
 * - El nombre no se repite entre iglesias (sin importar mayúsculas ni acentos).
 * - Una iglesia con asistentes registrados no se puede eliminar (se puede renombrar o mover).
 * - Todo cambio queda en "AuditLog" (church.create / church.update / church.delete).
 * - No requiere migración: usa las tablas que ya existen.
 */

export const CHURCH_NAME_MAX = 80;

export class ChurchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** minúsculas, sin acentos y sin espacios dobles: para comparar nombres. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function cleanName(raw: unknown): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) throw new ChurchError('Escribe el nombre de la iglesia (mínimo 3 letras).');
  if (name.length > CHURCH_NAME_MAX) throw new ChurchError(`Máximo ${CHURCH_NAME_MAX} caracteres.`);
  return name;
}

export async function listChurchesAdmin(): Promise<AdminChurchesResponse> {
  const churches = await query<Omit<AdminChurchRow, 'city'>>(
      `SELECT c.id, c.name, c."presbyteryId", p.name AS "presbyteryName", z.name AS "zoneName",
              (SELECT COUNT(*)::int FROM "Attendee" a WHERE a."churchId" = c.id) AS attendees
         FROM "Church" c
         JOIN "Presbytery" p ON p.id = c."presbyteryId"
         JOIN "Zone" z ON z.id = p."zoneId"`,
  );
  const presbyteries = await query<AdminPresbyteryOption>(
    `SELECT p.id, p.name, z.name AS "zoneName"
       FROM "Presbytery" p JOIN "Zone" z ON z.id = p."zoneId"`,
  );
  const byName = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });
  return {
    churches: churches.rows
      .map((c) => ({ ...c, city: deriveCity(c.name, c.presbyteryName) }))
      .sort((a, b) => byName(a.name, b.name)),
    presbyteries: presbyteries.rows.sort((a, b) => byName(a.zoneName, b.zoneName) || byName(a.name, b.name)),
    nameMax: CHURCH_NAME_MAX,
  };
}

type Tx = PoolClient;

async function getPresbytery(tx: Tx, id: unknown) {
  const r = await tx.query<{ id: string; name: string; zoneName: string }>(
    `SELECT p.id, p.name, z.name AS "zoneName" FROM "Presbytery" p JOIN "Zone" z ON z.id = p."zoneId" WHERE p.id = $1`,
    [String(id ?? '')],
  );
  if (!r.rows[0]) throw new ChurchError('Elige un presbiterio de la lista.');
  return r.rows[0];
}

async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const { rows } = await tx.query<{ id: string; name: string }>(`SELECT id, name FROM "Church"`);
  const n = norm(name);
  const clash = rows.find((r) => r.id !== exceptId && norm(r.name) === n);
  if (clash) throw new ChurchError(`Ya existe una iglesia llamada "${clash.name}".`, 409);
}

const audit = (tx: Tx, actorId: string, action: string, entityId: string, metadata: unknown) =>
  tx.query(
    `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
     VALUES ($1, $2, $3, 'Church', $4, $5::jsonb, ${NOW_UTC})`,
    [newId(), actorId, action, entityId, JSON.stringify(metadata)],
  );

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === '23505';

export async function createChurch(actorId: string, input: Partial<ChurchInput>): Promise<{ id: string }> {
  const name = cleanName(input.name);
  try {
    return await withTransaction(async (tx) => {
      const presbytery = await getPresbytery(tx, input.presbyteryId);
      await assertNameFree(tx, name);
      const id = newId();
      await tx.query(
        `INSERT INTO "Church" (id, name, "presbyteryId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, ${NOW_UTC}, ${NOW_UTC})`,
        [id, name, presbytery.id],
      );
      await audit(tx, actorId, 'church.create', id, { name, presbytery: presbytery.name, zone: presbytery.zoneName });
      return { id };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ChurchError('Esa iglesia ya existe en ese presbiterio.', 409);
    throw err;
  }
}

export async function updateChurch(actorId: string, id: string, input: Partial<ChurchInput>): Promise<void> {
  const name = cleanName(input.name);
  try {
    await withTransaction(async (tx) => {
      const cur = await tx.query<{ name: string; presbyteryId: string; presbyteryName: string; zoneName: string }>(
        `SELECT c.name, c."presbyteryId", p.name AS "presbyteryName", z.name AS "zoneName"
           FROM "Church" c JOIN "Presbytery" p ON p.id = c."presbyteryId" JOIN "Zone" z ON z.id = p."zoneId"
          WHERE c.id = $1 FOR UPDATE OF c`,
        [id],
      );
      const before = cur.rows[0];
      if (!before) throw new ChurchError('Esa iglesia ya no existe.', 404);
      const presbytery = await getPresbytery(tx, input.presbyteryId);

      const changes: Record<string, { from: string; to: string }> = {};
      if (name !== before.name) changes.name = { from: before.name, to: name };
      if (presbytery.id !== before.presbyteryId) {
        changes.presbytery = { from: before.presbyteryName, to: presbytery.name };
        if (presbytery.zoneName !== before.zoneName) changes.zone = { from: before.zoneName, to: presbytery.zoneName };
      }
      if (!Object.keys(changes).length) return; // sin cambios
      if (changes.name && norm(name) !== norm(before.name)) await assertNameFree(tx, name, id);

      await tx.query(`UPDATE "Church" SET name = $1, "presbyteryId" = $2, "updatedAt" = ${NOW_UTC} WHERE id = $3`, [
        name,
        presbytery.id,
        id,
      ]);
      await audit(tx, actorId, 'church.update', id, { church: name, ...changes });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ChurchError('Esa iglesia ya existe en ese presbiterio.', 409);
    throw err;
  }
}

export async function deleteChurch(actorId: string, id: string): Promise<void> {
  try {
    await withTransaction(async (tx) => {
      const cur = await tx.query<{ name: string; presbyteryName: string; zoneName: string }>(
        `SELECT c.name, p.name AS "presbyteryName", z.name AS "zoneName"
           FROM "Church" c JOIN "Presbytery" p ON p.id = c."presbyteryId" JOIN "Zone" z ON z.id = p."zoneId"
          WHERE c.id = $1 FOR UPDATE OF c`,
        [id],
      );
      const row = cur.rows[0];
      if (!row) throw new ChurchError('Esa iglesia ya no existe.', 404);
      const used = await tx.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "Attendee" WHERE "churchId" = $1`, [id]);
      const n = used.rows[0].n;
      if (n > 0)
        throw new ChurchError(
          `No se puede eliminar: ${n} ${n === 1 ? 'asistente está registrado' : 'asistentes están registrados'} en esta iglesia. Puedes renombrarla o moverla de presbiterio.`,
          409,
        );
      await tx.query(`DELETE FROM "Church" WHERE id = $1`, [id]);
      await audit(tx, actorId, 'church.delete', id, { name: row.name, presbytery: row.presbyteryName, zone: row.zoneName });
    });
  } catch (err) {
    // 23503 = alguien se registró justo ahora: la llave foránea protege el dato.
    if ((err as { code?: string })?.code === '23503')
      throw new ChurchError('No se puede eliminar: ya tiene asistentes registrados.', 409);
    throw err;
  }
}

import { NOW_UTC, newId, query, withTransaction } from './db';
import {
  parsePageSize,
  isValidAgeRange,
  pulseCodeLabel,
  type AdminAttendeeDetail,
  type AdminAttendeeFilters,
  type AdminAttendeeRow,
  type AdminAttendeesCatalog,
  type AdminAttendeesResponse,
  type UpdateAttendeeRequest,
} from '../shared/api';

/**
 * Etapa 4 — Asistentes (solo Admin). Lee las tablas existentes de Neon
 * ("Attendee", "Church" → "Presbytery" → "Zone", "Pulse", "Package",
 * "Redemption", "User"); no hay cambios de esquema.
 *
 * - Cada asistente tiene a lo más UNA pulsera ACTIVE (índice
 *   pulse_one_active_per_attendee). El kit y las aguas salen de esa pulsera.
 * - "Estado" = estado de sus aguas: con disponibles / agotadas / su kit no
 *   incluye (decisión del 1 oct 2026: un asistente registrado siempre tiene
 *   pulsera activa, así que el estado útil es el de las aguas).
 * - Admin puede corregir nombre, rango de edad e iglesia. No se borran
 *   asistentes ni se cambia su kit (para eso está el reemplazo de pulsera).
 *   Cada corrección deja AuditLog "attendee.update" con el antes y el después.
 */

export class AttendeeError extends Error {}

/** Comparación sin acentos (igual que la búsqueda de Staff, sin extensiones nuevas). */
const unaccent = (expr: string) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;

/* ------------------------------------------------------------------ */
/* Lista                                                                */
/* ------------------------------------------------------------------ */

export async function listAttendees(f: AdminAttendeeFilters): Promise<AdminAttendeesResponse> {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };

  // Cada palabra debe aparecer en el nombre, en cualquier orden y sin importar
  // acentos ni mayúsculas: "maria lopez" encuentra "María Fernanda López".
  const words = String(f.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const w of words) add((n) => `${unaccent('a."fullName"')} LIKE ${unaccent(`$${n}`)}`, `%${w}%`);
  if (f.zoneId) add((n) => `z.id = $${n}`, f.zoneId);
  if (f.presbyteryId) add((n) => `pr.id = $${n}`, f.presbyteryId);
  if (f.churchId) add((n) => `c.id = $${n}`, f.churchId);
  if (f.packageId) add((n) => `p."packageId" = $${n}`, f.packageId);
  if (f.drinks === 'available') where.push(`k."includedDrinks" > 0 AND p."drinksUsed" < k."includedDrinks"`);
  if (f.drinks === 'exhausted') where.push(`k."includedDrinks" > 0 AND p."drinksUsed" >= k."includedDrinks"`);
  if (f.drinks === 'none') where.push(`k."includedDrinks" = 0`);

  // Solo asistentes con pulsera activa (todos los registrados la tienen).
  const from = `
    FROM "Attendee" a
    JOIN "Pulse" p ON p."attendeeId" = a.id AND p.status = 'ACTIVE'
    JOIN "Package" k ON k.id = p."packageId"
    JOIN "Church" c ON c.id = a."churchId"
    JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
    JOIN "Zone" z ON z.id = pr."zoneId"
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;

  // Filtros → conteo total filtrado → orden → página (todo en el servidor).
  const total = (await query<{ n: number }>(`SELECT count(*)::int AS n ${from}`, params)).rows[0].n;
  const pageSize = parsePageSize(f.pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  // Una página fuera de rango (p. ej. ?pagina=8 con un filtro de 2 páginas) se ajusta a la última.
  const page = Math.min(lastPage, Math.max(0, Math.floor(Number(f.page) || 0)));

  const { rows } = await query<AdminAttendeeRow>(
    `SELECT a.id, a."fullName", a."ageRange", a.age,
            c.name AS "churchName", pr.name AS "presbyteryName", z.name AS "zoneName",
            k.name AS "packageName", k."includedDrinks", p."drinksUsed",
            to_char(a."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
       ${from}
      ORDER BY a."createdAt" DESC, a.id DESC
      LIMIT ${pageSize} OFFSET ${page * pageSize}`,
    params,
  );
  return { total, page, pageSize, rows };
}

/** Catálogo para los filtros (zona → presbiterio → iglesia, kits). */
export async function attendeesCatalog(): Promise<AdminAttendeesCatalog> {
  const [zones, presbyteries, churches, packages] = await Promise.all([
    query<{ id: string; name: string }>(`SELECT id, name FROM "Zone" ORDER BY name`),
    query<{ id: string; name: string; zoneId: string }>(`SELECT id, name, "zoneId" FROM "Presbytery" ORDER BY name`),
    query<{ id: string; name: string; presbyteryId: string }>(`SELECT id, name, "presbyteryId" FROM "Church" ORDER BY name`),
    query<{ id: string; name: string }>(`SELECT id, name FROM "Package" ORDER BY price, name`),
  ]);
  return { zones: zones.rows, presbyteries: presbyteries.rows, churches: churches.rows, packages: packages.rows };
}

/* ------------------------------------------------------------------ */
/* Detalle                                                              */
/* ------------------------------------------------------------------ */

export async function getAttendee(id: string): Promise<AdminAttendeeDetail | null> {
  const { rows } = await query<{
    id: string;
    fullName: string;
    ageRange: string | null;
    age: number | null;
    churchId: string;
    churchName: string;
    presbyteryName: string;
    zoneName: string;
    createdAt: string;
  }>(
    `SELECT a.id, a."fullName", a."ageRange", a.age, c.id AS "churchId", c.name AS "churchName",
            pr.name AS "presbyteryName", z.name AS "zoneName",
            to_char(a."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
       FROM "Attendee" a
       JOIN "Church" c ON c.id = a."churchId"
       JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
       JOIN "Zone" z ON z.id = pr."zoneId"
      WHERE a.id = $1`,
    [id],
  );
  const a = rows[0];
  if (!a) return null;

  const pulses = await query<{
    id: string;
    manualCode: string;
    status: 'UNCLAIMED' | 'ACTIVE' | 'INVALIDATED';
    batchId: string;
    batchCode: string;
    packageName: string;
    includedDrinks: number;
    drinksUsed: number;
    claimedAt: string | null;
    updatedAt: string;
  }>(
    `SELECT p.id, p."manualCode", p.status::text AS status, b.id AS "batchId", b.code AS "batchCode",
            k.name AS "packageName", k."includedDrinks", p."drinksUsed",
            to_char(p."claimedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "claimedAt",
            to_char(p."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
       FROM "Pulse" p
       JOIN "Batch" b ON b.id = p."batchId"
       JOIN "Package" k ON k.id = p."packageId"
      WHERE p."attendeeId" = $1
      ORDER BY (p.status = 'ACTIVE') DESC, p."claimedAt" DESC NULLS LAST`,
    [id],
  );

  const redemptions = await query<{ id: string; createdAt: string; staffName: string; pulseCode: string }>(
    `SELECT r.id, to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            u.name AS "staffName", p."manualCode" AS "pulseCode"
       FROM "Redemption" r
       JOIN "User" u ON u.id = r."createdById"
       JOIN "Pulse" p ON p.id = r."pulseId"
      WHERE r."attendeeId" = $1
      ORDER BY r."createdAt" DESC`,
    [id],
  );

  return {
    ...a,
    pulses: pulses.rows.map((p) => ({ ...p, label: pulseCodeLabel(p.manualCode) })),
    redemptions: redemptions.rows.map((r) => ({ ...r, pulseLabel: pulseCodeLabel(r.pulseCode) })),
  };
}

/* ------------------------------------------------------------------ */
/* Corrección de datos                                                  */
/* ------------------------------------------------------------------ */

/** Mismas reglas que el registro (server/attendee.ts → claimPulse). */
export async function updateAttendee(id: string, input: UpdateAttendeeRequest, actorId: string) {
  const fullName = String(input.fullName ?? '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 2 || fullName.length > 120) throw new AttendeeError('Escribe el nombre completo.');
  const ageRange = String(input.ageRange ?? '');
  if (!isValidAgeRange(ageRange)) throw new AttendeeError('Selecciona un rango de edad.');
  const churchId = String(input.churchId ?? '');

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ fullName: string; ageRange: string | null; churchId: string; churchName: string }>(
      `SELECT a."fullName", a."ageRange", a."churchId", c.name AS "churchName"
         FROM "Attendee" a JOIN "Church" c ON c.id = a."churchId"
        WHERE a.id = $1 FOR UPDATE OF a`,
      [id],
    );
    const before = rows[0];
    if (!before) throw new AttendeeError('Ese asistente no existe.');
    const church = await tx.query<{ name: string }>(`SELECT name FROM "Church" WHERE id = $1`, [churchId]);
    if (!church.rowCount) throw new AttendeeError('Elige una iglesia de la lista.');

    const changes: Record<string, { from: string | null; to: string }> = {};
    if (before.fullName !== fullName) changes.fullName = { from: before.fullName, to: fullName };
    if (before.ageRange !== ageRange) changes.ageRange = { from: before.ageRange, to: ageRange };
    if (before.churchId !== churchId) changes.church = { from: before.churchName, to: church.rows[0].name };
    if (!Object.keys(changes).length) return { changed: false };

    await tx.query(
      `UPDATE "Attendee" SET "fullName" = $2, "ageRange" = $3, "churchId" = $4, "updatedAt" = ${NOW_UTC} WHERE id = $1`,
      [id, fullName, ageRange, churchId],
    );
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'attendee.update', 'Attendee', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, id, JSON.stringify({ attendee: fullName, ...changes })],
    );
    return { changed: true };
  });
}

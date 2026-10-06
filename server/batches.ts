import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { NOW_UTC, newId, query, withTransaction } from './db';
import { shortToken } from './wristband';
import {
  BATCH_CODE_RE,
  MANUAL_CODE_SENTINEL_PREFIX,
  MAX_BATCH_PULSES,
  MIN_BATCH_PULSES,
  type AdminBatchDetail,
  type AdminBatchRow,
  type AdminPulseRow,
  type BatchStatus,
  type CreateBatchRequest,
  type CreateBatchResponse,
  type PackageSummary,
  type PulseStatus,
  parsePageSize,
} from '../shared/api';

/**
 * Etapa 3 — Lotes (tablas "Batch" y "Pulse" de Neon, sin cambios de esquema
 * más allá de migrations/001_batch_status.sql).
 *
 * Reglas que aplica ESTE archivo (el frontend solo las refleja):
 * - Un lote es de UN solo paquete: `Batch.packageId` es FK única.
 * - 1 a 500 pulseras por lote (decisión del 1 oct 2026). Si se necesitan 1500,
 *   son tres lotes; no hay procesamiento por bloques.
 * - Todo el alta (lote + N pulseras + auditoría) ocurre en UNA transacción: si
 *   algo falla no queda un lote a medias.
 * - La pulsera se identifica SOLO por `qrToken`. No se generan códigos
 *   manuales nuevos; la columna "manualCode" (TEXT NOT NULL UNIQUE en Neon) se
 *   llena con el centinela `QRONLY:<qrToken>` porque la base la exige.
 * - "Batch"."status" siempre nace en 'ABIERTO'. Cerrar/cancelar es Etapa futura.
 * - Se escribe AuditLog action="batch.create" con EXACTAMENTE las llaves
 *   {packageId, quantity, code}, igual que el Next.js.
 *
 * Sobre las columnas: la base real manda. Antes de escribir cualquier query se
 * verificó el esquema contra information_schema (ver docs/CLAUDE_HANDOFF.md
 * §31 y `npm run db:esquema`). En particular la columna de precio de "Package" se llama `price`, NO
 * `priceCents` como dice el schema.prisma del Next.js, y "Pulse"."updatedAt"
 * no tiene default en la base (Prisma lo llena en el cliente).
 */

export class BatchError extends Error {}

/* ------------------------------------------------------------------ */
/* qrToken                                                              */
/* ------------------------------------------------------------------ */

/**
 * 16 caracteres base62 (62^16 ≈ 4.77e28 combinaciones), del CSPRNG de Node.
 * Mismo alfabeto y misma longitud que valida `QR_TOKEN_RE` de shared/api.ts.
 * Se genera con rechazo para que el resultado sea uniforme (un byte
 * aleatorio módulo 62 no sesga: 256 = 4*62 + 8, así que se rechazan los
 * residues ≥ 248, igual que hace Usuarios.tsx con su alfabeto de 31).
 */
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function generateQrToken(): string {
  const limit = 248; // 4 * 62
  let out = '';
  while (out.length < 16) {
    for (const byte of randomBytes(32)) {
      if (byte < limit) out += BASE62[byte % 62];
      if (out.length === 16) break;
    }
  }
  return out;
}

/**
 * N tokens distintos entre sí.
 *
 * El espacio es tan grande que una colisión es prácticamente imposible, pero
 * un duplicado dentro del mismo lote sí sería un fallo duro (el índice único
 * "Pulse_qrToken_key" lo rechazaría), así que se deduplica en memoria antes de
 * tocar la base.
 */
function generateTokens(n: number): string[] {
  const seen = new Set<string>();
  while (seen.size < n) seen.add(generateQrToken());
  return [...seen];
}

/* ------------------------------------------------------------------ */
/* Listado                                                              */
/* ------------------------------------------------------------------ */

type BatchListRow = {
  id: string;
  code: string;
  status: BatchStatus;
  packageId: string;
  packageName: string;
  packagePrice: number;
  quantity: number;
  createdBy: string;
  createdAt: string;
  total: number;
  unclaimed: number;
  active: number;
  invalidated: number;
};

/**
 * Lotes con sus conteos de pulseras.
 *
 * `count(p.id) FILTER (...)` y no `count(*) FILTER (...)`: con LEFT JOIN, un
 * lote sin pulseras produce una fila con p.id = NULL y `count(*)` contaría esa
 * fila como si fuera una pulsera sin reclamar.
 */
function listSql(where = ''): string {
  return `
  SELECT b.id, b.code, b.status, b.quantity,
         b."packageId", k.name AS "packageName", k.price AS "packagePrice",
         u.name AS "createdBy",
         to_char(b."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
         count(p.id)::int AS total,
         count(p.id) FILTER (WHERE p.status = 'UNCLAIMED')::int AS unclaimed,
         count(p.id) FILTER (WHERE p.status = 'ACTIVE')::int AS active,
         count(p.id) FILTER (WHERE p.status = 'INVALIDATED')::int AS invalidated
    FROM "Batch" b
    JOIN "Package" k ON k.id = b."packageId"
    JOIN "User" u ON u.id = b."createdById"
    LEFT JOIN "Pulse" p ON p."batchId" = b.id
   ${where}
   GROUP BY b.id, b.code, b.status, b.quantity, b."packageId", k.name, k.price, u.name, b."createdAt"
   ORDER BY b."createdAt" DESC, b.code DESC`;
}

export async function listBatches(): Promise<AdminBatchRow[]> {
  const { rows } = await query<BatchListRow>(listSql());
  return rows;
}

/* ------------------------------------------------------------------ */
/* Detalle                                                              */
/* ------------------------------------------------------------------ */

/** Filtros y página de la tabla de pulseras de un lote (server-side). */
export type BatchPulseQuery = { page?: number; pageSize?: number; q?: string; status?: string };

/** Escapa los comodines de LIKE en lo que escribe el usuario. */
const likeEscape = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * Detalle del lote + UNA página de sus pulseras (nunca las 500 de golpe).
 *
 * Secuencia: pulseras del lote → numeradas por orden de creación (`position`,
 * la "#" de la tabla, estable aunque se filtre) → filtros (estado y búsqueda)
 * → conteo filtrado → página (LIMIT/OFFSET). Una página fuera de rango se
 * ajusta a la última que exista.
 *
 * Búsqueda `q` (sobre TODO el lote, no solo la página visible): parte del
 * token del QR, del código (`AR26-…` / `QRONLY:…`), del nombre del asistente
 * (sin acentos) o el número de la pulsera en el lote ("127").
 *
 * `base` = origen de los QR (baseUrlOrEmpty(req)); vacío si no hay dominio.
 */
export async function getBatch(id: string, base: string, opts: BatchPulseQuery = {}): Promise<AdminBatchDetail | null> {
  const { rows: batches } = await query<BatchListRow>(listSql('WHERE b.id = $1'), [id]);
  const batch = batches[0];
  if (!batch) return null;

  const params: unknown[] = [id];
  const where: string[] = [];
  const status = String(opts.status ?? '').toUpperCase();
  if (status === 'UNCLAIMED' || status === 'ACTIVE' || status === 'INVALIDATED') {
    params.push(status);
    where.push(`n.status = $${params.length}`);
  }
  const q = String(opts.q ?? '').trim().slice(0, 80);
  if (q) {
    params.push(`%${likeEscape(q)}%`);
    const like = `$${params.length}`;
    const conds = [
      `n."qrToken" ILIKE ${like}`,
      `n."manualCode" ILIKE ${like}`,
      `translate(lower(COALESCE(n."attendeeName", '')), 'áéíóúüñ', 'aeiouun') LIKE translate(lower(${like}), 'áéíóúüñ', 'aeiouun')`,
    ];
    if (/^\d{1,4}$/.test(q)) {
      params.push(Number(q));
      conds.push(`n.position = $${params.length}`);
    }
    where.push(`(${conds.join(' OR ')})`);
  }

  const numbered = `
    WITH n AS (
      SELECT p.id, p."qrToken", p."manualCode", p.status::text AS status, k.name AS "packageName",
             p."drinksUsed", p."createdAt", p."claimedAt",
             a."fullName" AS "attendeeName", p."attendeeId",
             row_number() OVER (ORDER BY p."createdAt" ASC, p.id ASC)::int AS position
        FROM "Pulse" p
        JOIN "Package" k ON k.id = p."packageId"
        LEFT JOIN "Attendee" a ON a.id = p."attendeeId"
       WHERE p."batchId" = $1
    )`;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const filteredTotal = (await query<{ n: number }>(`${numbered} SELECT count(*)::int AS n FROM n ${whereSql}`, params)).rows[0].n;
  const pageSize = parsePageSize(opts.pageSize);
  const lastPage = Math.max(0, Math.ceil(filteredTotal / pageSize) - 1);
  const page = Math.min(lastPage, Math.max(0, Math.floor(Number(opts.page) || 0)));

  const { rows: pulses } = await query<{
    id: string;
    qrToken: string;
    status: PulseStatus;
    packageName: string;
    drinksUsed: number;
    createdAt: string;
    claimedAt: string | null;
    attendeeName: string | null;
    attendeeId: string | null;
    position: number;
  }>(
    `${numbered}
     SELECT n.id, n."qrToken", n.status, n."packageName", n."drinksUsed",
            to_char(n."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            to_char(n."claimedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "claimedAt",
            n."attendeeName", n."attendeeId", n.position
       FROM n ${whereSql}
      ORDER BY n.position ASC
      LIMIT ${pageSize} OFFSET ${page * pageSize}`,
    params,
  );

  const withUrls: AdminPulseRow[] = pulses.map((p) => ({
    ...p,
    shortToken: shortToken(p.qrToken),
    // Sin PUBLIC_BASE_URL no se inventa un enlace relativo ("/p/…"): se manda
    // vacío y la pantalla avisa que falta configurar el dominio.
    qrUrl: base ? `${base}/p/${p.qrToken}` : '',
  }));

  return { ...batch, pulses: withUrls, filteredTotal, page, pageSize, qrBase: base };
}

/** Los tokens de un lote, para el PDF. Valida que el lote exista. */
export async function batchTokens(id: string): Promise<{ code: string; tokens: { qrToken: string }[] } | null> {
  const { rows } = await query<{ code: string }>(`SELECT code FROM "Batch" WHERE id = $1`, [id]);
  if (!rows.length) return null;
  const pulses = await query<{ qrToken: string }>(
    `SELECT "qrToken" FROM "Pulse" WHERE "batchId" = $1 ORDER BY "createdAt" ASC, id ASC`,
    [id],
  );
  return { code: rows[0].code, tokens: pulses.rows };
}

/** Los tokens de UNA pulsera, para la descarga individual del QR. */
export async function pulseTokenInBatch(
  batchId: string,
  pulseId: string,
): Promise<{ qrToken: string; status: PulseStatus } | null> {
  const { rows } = await query<{ qrToken: string; status: PulseStatus }>(
    `SELECT "qrToken", status::text AS status FROM "Pulse" WHERE id = $1 AND "batchId" = $2`,
    [pulseId, batchId],
  );
  return rows[0] ?? null;
}

/**
 * Para armar URLs sin propagar la excepción de configuración a los listados.
 * Si PUBLIC_BASE_URL falta, el listado y el detalle siguen siendo utilizables
 * (el Admin ve los lotes igual); lo que falla es imprimir, que es donde el
 * dominio realmente importa.
 */

/* ------------------------------------------------------------------ */
/* Paquetes (para el formulario de alta)                                */
/* ------------------------------------------------------------------ */

/** Todos los paquetes, no solo los activos: la columna `price` es la real. */
export async function listPackagesForBatch(): Promise<(PackageSummary & { id: string; active: boolean })[]> {
  const { rows } = await query<PackageSummary & { id: string; active: boolean }>(
    `SELECT id, name, price, "includedDrinks", active FROM "Package" ORDER BY active DESC, price ASC, name ASC`,
  );
  return rows;
}

/* ------------------------------------------------------------------ */
/* Alta                                                                 */
/* ------------------------------------------------------------------ */

function cleanCode(raw: unknown): string {
  const code = String(raw ?? '').trim();
  if (!code) throw new BatchError('Escribe el nombre del lote.');
  if (code.length > 40) throw new BatchError('El nombre del lote puede tener máximo 40 caracteres.');
  if (!BATCH_CODE_RE.test(code)) {
    throw new BatchError('El nombre del lote solo puede llevar letras, números, punto, guion bajo, guion y espacios.');
  }
  return code;
}

function cleanQuantity(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isInteger(n)) throw new BatchError('La cantidad debe ser un número entero.');
  if (n < MIN_BATCH_PULSES || n > MAX_BATCH_PULSES) {
    throw new BatchError(`La cantidad debe ser entre ${MIN_BATCH_PULSES} y ${MAX_BATCH_PULSES} pulseras.`);
  }
  return n;
}

/**
 * Siguiente código libre con el formato de la referencia (LOTE-YYYY-NNN).
 * Solo es una ayuda para el Admin: el nombre del lote lo pone la persona.
 * Se basa en el conteo de códigos del año, igual que el Next.js, y además
 * salta los números que ya existen para no proponer uno ocupado.
 */
export async function suggestBatchCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LOTE-${year}-`;
  const { rows } = await query<{ code: string }>(
    `SELECT code FROM "Batch" WHERE code LIKE $1 ORDER BY code ASC`,
    [`${prefix}%`],
  );
  const used = new Set(rows.map((r) => r.code));
  for (let i = 1; i <= 999; i++) {
    const code = `${prefix}${String(i).padStart(3, '0')}`;
    if (!used.has(code)) return code;
  }
  throw new BatchError('Ya hay 999 lotes este año. Escribe el nombre a mano.');
}

async function assertPackageExists(tx: pg.PoolClient, packageId: string): Promise<PackageSummary> {
  const { rows } = await tx.query<PackageSummary>(
    `SELECT name, price, "includedDrinks" FROM "Package" WHERE id = $1`,
    [packageId],
  );
  const pkg = rows[0];
  if (!pkg) throw new BatchError('Ese kit no existe.');
  return pkg;
}

/** Cuántos de los tokens generados ya existen en "Pulse". */
async function existingTokens(tx: pg.PoolClient, tokens: string[]): Promise<Set<string>> {
  const { rows } = await tx.query<{ qrToken: string }>(
    `SELECT "qrToken" FROM "Pulse" WHERE "qrToken" = ANY($1::text[])`,
    [tokens],
  );
  return new Set(rows.map((r) => r.qrToken));
}

/**
 * Genera N tokens que no existen en la base.
 *
 * NO se reintenta dentro de la transacción a ciegas: en Postgres, un INSERT que
 * viola un índice único ABORTA la transacción completa, así que "reintentar el
 * INSERT" dentro del mismo BEGIN es imposible (es el error que arrastra el
 * Next.js). Aquí se resuelve antes: se consulta cuáles de los tokens ya
 * existen y se reemplazan solo esos, sin tocar la base. La probabilidad de que
 * haga falta es ~0 (4.77e28 combinaciones) pero el costo es una consulta.
 */
async function freshTokens(tx: pg.PoolClient, n: number): Promise<string[]> {
  const tokens = generateTokens(n);
  const taken = await existingTokens(tx, tokens);
  if (!taken.size) return tokens;

  const replacement = generateTokens(taken.size);
  const stillTaken = await existingTokens(tx, replacement);
  if (stillTaken.size) {
    // Prácticamente imposible; si ocurre se aborta y el llamador reintenta la
    // transacción completa, que es el único reintento válido aquí.
    throw new BatchError('No se pudieron generar identificadores únicos. Intenta de nuevo.');
  }
  const byToken = new Map(tokens.map((t) => [t, t]));
  for (const [i, token] of tokens.entries()) {
    if (taken.has(token)) byToken.set(token, replacement[i]);
  }
  return [...byToken.values()];
}

const INSERT_BATCH = `
  INSERT INTO "Batch" (id, code, "packageId", quantity, "createdById", status, "createdAt")
  VALUES ($1, $2, $3, $4, $5, 'ABIERTO', ${NOW_UTC})`;

/**
 * Alta de TODAS las pulseras del lote en una sola sentencia (antes: un INSERT
 * por pulsera dentro del loop, hasta 500 round trips contra el pool de 3
 * conexiones). `UNNEST` sobre 3 arrays alineados por posición arma las N filas
 * en el servidor de Postgres; sigue dentro de la MISMA transacción, conserva
 * IDs y códigos únicos generados en memoria y el mismo manejo de errores
 * (una violación de unicidad sigue abortando toda la transacción igual que antes).
 */
const INSERT_PULSES_BULK = `
  INSERT INTO "Pulse"
    (id, "qrToken", "manualCode", "batchId", "packageId", status, "attendeeId", "claimedAt",
     "drinksUsed", "replacesId", "createdAt", "updatedAt")
  SELECT t.id, t."qrToken", t."manualCode", $1, $2, 'UNCLAIMED', NULL, NULL, 0, NULL, ${NOW_UTC}, ${NOW_UTC}
    FROM UNNEST($3::text[], $4::text[], $5::text[]) AS t(id, "qrToken", "manualCode")`;

const INSERT_AUDIT = `
  INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
  VALUES ($1, $2, 'batch.create', 'Batch', $3, $4::jsonb, ${NOW_UTC})`;

const MAX_CREATE_ATTEMPTS = 3;

/**
 * Crea un lote con sus N pulseras, todo en una transacción.
 *
 * Reintenta la transacción COMPLETA ante una violación de unicidad (carrera
 * contra otro Admin creando un lote al mismo tiempo). El rollback garantiza
 * que no quede ni el lote ni pulseras huérfanas.
 */
export async function createBatch(
  createdById: string,
  input: CreateBatchRequest,
): Promise<CreateBatchResponse> {
  const code = cleanCode(input.code);
  const quantity = cleanQuantity(input.quantity);
  const packageId = String(input.packageId ?? '').trim();
  if (!packageId) throw new BatchError('Elige un kit.');

  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
    const batchId = newId();
    try {
      await withTransaction(async (tx) => {
        await assertPackageExists(tx, packageId);

        const dup = await tx.query(`SELECT 1 FROM "Batch" WHERE code = $1`, [code]);
        if (dup.rowCount) throw new BatchError(`Ya existe un lote llamado "${code}".`);

        const tokens = await freshTokens(tx, quantity);

        await tx.query(INSERT_BATCH, [batchId, code, packageId, quantity, createdById]);

        const ids = tokens.map(() => newId());
        const manualCodes = tokens.map((t) => `${MANUAL_CODE_SENTINEL_PREFIX}${t}`);
        await tx.query(INSERT_PULSES_BULK, [batchId, packageId, ids, tokens, manualCodes]);

        await tx.query(INSERT_AUDIT, [
          newId(),
          createdById,
          batchId,
          JSON.stringify({ packageId, quantity, code }),
        ]);
      });
      return { id: batchId, code, quantity };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === '23505' && attempt < MAX_CREATE_ATTEMPTS) continue; // carrera de unicidad
      if (e.code === '23505') throw new BatchError(`Ya existe un lote llamado "${code}".`);
      if (e.code === '23503') throw new BatchError('Ese kit ya no existe.');
      throw err;
    }
  }
  throw new BatchError('No se pudo crear el lote. Intenta de nuevo.');
}

/* ------------------------------------------------------------------------ */
/* Borrar un lote (7 oct 2026)                                              */
/* ------------------------------------------------------------------------ */

export type DeleteBatchResult = { code: string; pulses: number; attendees: number; redemptions: number; notes: number };

/**
 * Borra un lote COMPLETO en una transacción (todo o nada). Pensado para limpiar lotes de prueba.
 * Se borran: sus pulseras, los asistentes que se registraron SOLO con pulseras de este lote (con sus
 * notas, likes, canjes y estado de campana) y los canjes hechos con sus pulseras. Un asistente que
 * además tiene una pulsera de OTRO lote (reemplazo) se conserva.
 * `confirmCode` debe ser el nombre exacto del lote (confirmación escrita desde la pantalla).
 */
export async function deleteBatch(actorId: string, id: string, confirmCode: string): Promise<DeleteBatchResult> {
  try {
    return await withTransaction(async (tx) => {
      const b = await tx.query<{ code: string }>(`SELECT code FROM "Batch" WHERE id = $1 FOR UPDATE`, [id]);
      if (!b.rowCount) throw new BatchError('Ese lote ya no existe.');
      const code = b.rows[0].code;
      if (String(confirmCode ?? '').trim() !== code) throw new BatchError(`Para borrar escribe exactamente: ${code}`);

      // Asistentes que quedarían sin ninguna pulsera fuera de este lote.
      const orphan = (
        await tx.query<{ id: string }>(
          `SELECT DISTINCT p."attendeeId" AS id FROM "Pulse" p
            WHERE p."batchId" = $1 AND p."attendeeId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "Pulse" o WHERE o."attendeeId" = p."attendeeId" AND o."batchId" <> $1)`,
          [id],
        )
      ).rows.map((r) => r.id);

      const has = async (t: string) => Boolean((await tx.query(`SELECT to_regclass($1) AS t`, [`public."${t}"`])).rows[0].t);
      let notes = 0;
      if (orphan.length) {
        if (await has('Note')) {
          if (await has('NoteLike')) {
            await tx.query(
              `DELETE FROM "NoteLike" WHERE "attendeeId" = ANY($1::text[]) OR "noteId" IN (SELECT id FROM "Note" WHERE "attendeeId" = ANY($1::text[]))`,
              [orphan],
            );
          }
          notes = (await tx.query(`DELETE FROM "Note" WHERE "attendeeId" = ANY($1::text[])`, [orphan])).rowCount ?? 0;
        }
        if (await has('NotificationState')) {
          await tx.query(`DELETE FROM "NotificationState" WHERE "attendeeId" = ANY($1::text[])`, [orphan]);
        }
      }
      const redemptions =
        (
          await tx.query(
            `DELETE FROM "Redemption" WHERE "pulseId" IN (SELECT id FROM "Pulse" WHERE "batchId" = $1) OR "attendeeId" = ANY($2::text[])`,
            [id, orphan],
          )
        ).rowCount ?? 0;
      // Una pulsera de otro lote que reemplazó a una de este: se suelta la referencia.
      const selfRef = await tx.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'Pulse' AND column_name = 'replacesId'`);
      if (selfRef.rowCount) {
        await tx.query(
          `UPDATE "Pulse" SET "replacesId" = NULL WHERE "batchId" <> $1 AND "replacesId" IN (SELECT id FROM "Pulse" WHERE "batchId" = $1)`,
          [id],
        );
      }
      const pulses = (await tx.query(`DELETE FROM "Pulse" WHERE "batchId" = $1`, [id])).rowCount ?? 0;
      if (orphan.length) await tx.query(`DELETE FROM "Attendee" WHERE id = ANY($1::text[])`, [orphan]);
      await tx.query(`DELETE FROM "Batch" WHERE id = $1`, [id]);

      const result = { code, pulses, attendees: orphan.length, redemptions, notes };
      await tx.query(
        `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
         VALUES ($1, $2, 'batch.delete', 'Batch', $3, $4::jsonb, ${NOW_UTC})`,
        [newId(), actorId, id, JSON.stringify(result)],
      );
      return result;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23503') {
      throw new BatchError('No se pudo borrar: hay datos que dependen de este lote. Usa el script db:limpiar-pruebas.');
    }
    throw err;
  }
}

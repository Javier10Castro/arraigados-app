import pg from 'pg';
import { randomBytes } from 'node:crypto';

/**
 * Conexión a Neon (la MISMA base del proyecto Next.js).
 *
 * Reglas para no romper al Next.js (Prisma) que comparte estas tablas:
 * - Nunca crear/alterar tablas desde aquí: solo SELECT/INSERT/UPDATE sobre el
 *   esquema existente.
 * - Prisma genera `id` (cuid) y `updatedAt` en el cliente, la base NO tiene
 *   default para esas columnas: todo INSERT/UPDATE de Vite los llena a mano
 *   (ver newId() y NOW_UTC).
 * - Prisma guarda fechas en UTC en columnas TIMESTAMP(3) sin zona: usar
 *   NOW_UTC, nunca now() a secas.
 */

/** Expresión SQL para "ahora" en UTC, igual a como escribe Prisma. */
export const NOW_UTC = `(now() AT TIME ZONE 'utc')`;

/** Parámetros que Prisma agrega a la URL y que node-postgres no entiende. */
// sslmode también se quita: el SSL se configura explícito en getPool() (verificación completa).
const PRISMA_ONLY_PARAMS = ['sslmode', 'channel_binding', 'schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout', 'statement_cache_size'];

function connectionString() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('Falta DATABASE_URL en el archivo .env de arraigados-app (ver .env.example).');
  }
  const url = new URL(raw);
  for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

let pool: pg.Pool | null = null;

export function getPool() {
  if (!pool) {
    const cs = connectionString();
    const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(cs);
    pool = new pg.Pool({
      connectionString: cs,
      // Neon exige SSL; una base local de pruebas no.
      ssl: isLocal ? undefined : { rejectUnauthorized: true },
      max: 3,
      idleTimeoutMillis: 10_000,
      // El plan gratuito de Neon "duerme" el cómputo; el primer intento puede tardar.
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

/** Ejecuta `fn` dentro de una transacción (BEGIN/COMMIT, ROLLBACK si lanza). */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Id compatible con el `@default(cuid())` de Prisma: 25 caracteres, empieza
 * con "c", minúsculas y dígitos. Prisma solo lo trata como texto, así que lo
 * importante es que sea único (aquí: 120 bits aleatorios de CSPRNG).
 */
export function newId(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(24);
  let out = 'c';
  for (let i = 0; i < 24; i++) out += alphabet[bytes[i] % 36];
  return out;
}

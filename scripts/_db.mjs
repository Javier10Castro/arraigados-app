// Utilidades compartidas por los scripts de mantenimiento de la base (Neon).
// Se corren con  npm run db:<comando>  (ver package.json); leen DATABASE_URL del archivo .env.
import pg from 'pg';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// sslmode también se quita: el SSL se configura explícito abajo (verificación completa del certificado).
const PRISMA_ONLY_PARAMS = ['sslmode', 'channel_binding', 'schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout', 'statement_cache_size'];

export function connect() {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile('.env'); // Node 20.12+ / 21.7+
    } catch {
      // se explica abajo
    }
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('\n✖ No encontré DATABASE_URL.');
    console.error('  Crea el archivo .env dentro de arraigados-app con la línea DATABASE_URL=... (ver .env.example).');
    console.error('  Es la misma conexión que usa el proyecto Next.js en su propio .env.\n');
    process.exit(1);
  }
  const url = new URL(raw);
  for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p);
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
    connectionTimeoutMillis: 20_000,
  });
  return { client, host: url.hostname, database: url.pathname.slice(1) };
}

/**
 * Datos de PRUEBA que se respaldan / limpian, en orden de INSERCIÓN (padres
 * antes que hijos). Para borrar se recorre al revés.
 * NO se tocan: Zone, Presbytery, Church, Package, User, InstantConfig.
 *
 * AuditLog: solo las entradas de pruebas (lotes, pulseras, canjes,
 * asistentes, instantáneas). Se conservan las de configuración.
 */
export const TEST_AUDIT_TYPES = ['Batch', 'Pulse', 'Attendee', 'Redemption', 'InstantCredit', 'Instant', 'InstantView'];

export const TABLES = [
  { name: 'Attendee' },
  { name: 'Batch' },
  { name: 'Pulse' },
  { name: 'Redemption' },
  { name: 'InstantCredit' },
  { name: 'Instant' },
  { name: 'InstantView' },
  { name: 'AuditLog', where: `"entityType" = ANY($1)`, params: [TEST_AUDIT_TYPES] },
];

export async function counts(client) {
  const out = {};
  for (const t of TABLES) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM "${t.name}"${t.where ? ` WHERE ${t.where}` : ''}`,
      t.params ?? [],
    );
    out[t.name] = rows[0].n;
  }
  return out;
}

export async function contextCounts(client) {
  const q = async (sql) => (await client.query(sql)).rows[0].n;
  return {
    iglesias: await q(`SELECT count(*)::int AS n FROM "Church"`),
    paquetes: await q(`SELECT count(*)::int AS n FROM "Package"`),
    usuarios: await q(`SELECT count(*)::int AS n FROM "User"`),
  };
}

export function printCounts(title, c) {
  console.log(`\n${title}`);
  const label = { AuditLog: 'AuditLog (solo pruebas)' };
  for (const [k, v] of Object.entries(c)) console.log(`  ${(label[k] ?? k).padEnd(26)} ${String(v).padStart(6)}`);
}

export async function ask(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

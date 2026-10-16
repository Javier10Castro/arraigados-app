import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/**
 * Base de datos DESECHABLE para las pruebas de integración del límite de frecuencia.
 *
 * SEGURIDAD: se niega a correr si TEST_DATABASE_URL no apunta a localhost y a una base cuyo nombre empiece con
 * "arraigados_test". Antes de cada corrida BORRA y recrea el esquema "public" de esa base. Nunca la apuntes a Neon.
 */
export function assertSafeTestDatabase(raw: string | undefined): URL {
  if (!raw) throw new Error('Falta TEST_DATABASE_URL.');
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const db = url.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a localhost (recibido: ${host}). Estas pruebas borran el esquema "public".`);
  }
  if (!/^arraigados_test/.test(db)) {
    throw new Error(`El nombre de la base de pruebas debe empezar con "arraigados_test" (recibido: "${db}").`);
  }
  return url;
}

/** Tablas del esquema original (Prisma / Next.js) que las rutas probadas necesitan, simplificadas. */
const BASE_SCHEMA = `
CREATE TYPE "UserRole" AS ENUM ('ADMIN','STAFF');
CREATE TABLE "Zone"(id text primary key, name text unique, "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());
CREATE TABLE "Presbytery"(id text primary key, name text not null, "zoneId" text not null references "Zone"(id), "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());
CREATE TABLE "Church"(id text primary key, name text not null, "presbyteryId" text not null references "Presbytery"(id), "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());
CREATE TABLE "Package"(id text primary key, name text unique, price int, "includedDrinks" int not null default 0, active boolean not null default true, "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());
CREATE TABLE "Attendee"(id text primary key, "fullName" text, "ageRange" text, age int, "churchId" text references "Church"(id), "createdAt" timestamp(3), "updatedAt" timestamp(3));
CREATE TABLE "User"(id text primary key, email text, name text, role "UserRole", active boolean, "passwordHash" text, "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());
CREATE TABLE "Batch"(id text primary key, code text unique, "packageId" text, quantity int, status text not null default 'ABIERTO', "createdById" text not null, "createdAt" timestamp(3) not null default now());
CREATE TABLE "Pulse"(id text primary key, "qrToken" text unique, status text, "attendeeId" text, "manualCode" text unique, "packageId" text, "drinksUsed" int not null default 0, "batchId" text, "replacesId" text, "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now(), "claimedAt" timestamp(3));
CREATE TABLE "Redemption"(id text primary key, "attendeeId" text, "pulseId" text, "packageId" text, quantity int, location text, "idempotencyKey" text unique, "createdById" text, "createdAt" timestamp(3) not null default now());
CREATE TABLE "AuditLog"(id text primary key, "entityType" text, "entityId" text, action text, metadata jsonb, "actorId" text, "createdAt" timestamp(3) default (now() AT TIME ZONE 'utc'));
`;

const MIGRATIONS = [
  '002_notes', '005_blocked_words', '006_announcements', '007_announcement_live', '008_package_benefits',
  '009_attendee_profile', '010_attendee_profile_keep_all', '011_rate_limit', '012_staff_selfredeem',
];

/** Borra y recrea el esquema y aplica las migraciones necesarias. Devuelve un cliente conectado. */
export async function resetTestDatabase(url: URL): Promise<pg.Client> {
  assertSafeTestDatabase(url.toString());
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query(BASE_SCHEMA);
  for (const m of MIGRATIONS) {
    await client.query(fs.readFileSync(path.resolve('migrations', `${m}.sql`), 'utf8'));
  }
  return client;
}

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { assertSafeTestDatabase } from '../rate-limit/testdb.mts';

export { assertSafeTestDatabase };

/**
 * Base DESECHABLE para las pruebas de pulseras de equipo y autocanje.
 *
 * ESQUEMA REAL (v5): copiado de la salida de `npm run db:esquema` ejecutada por el propietario sobre su base de Neon
 * (16 oct 2026): Batch, Pulse, Package, Attendee, User, Redemption y AuditLog, con columnas, nulabilidad, valores
 * predeterminados, CHECK, llaves foráneas (ON UPDATE CASCADE; ON DELETE como indica cada una) e índices.
 * Puntos que el esquema de pruebas anterior (v4) NO reproducía y ahora sí:
 *   · "Pulse"."batchId" es NOT NULL; ids y "updatedAt" NO tienen DEFAULT (Prisma los llenaba en su cliente);
 *   · "Redemption"."packageId" NO tiene llave foránea; "Pulse_replacesId_key" es único;
 *   · CHECK attendee_age_range_valid, batch_status_valid, pulse_drinks_used_non_negative;
 *   · "User"."role" tiene DEFAULT 'STAFF'; "AuditLog"."actorId" tiene FK ON DELETE SET NULL; índices reales.
 * NO verificado contra Neon (el script no lista estas tablas, se dejan como en v4): Zone, Presbytery, Church
 * (y sus defaults), la precisión exacta de los timestamp (aquí timestamp(3), como genera Prisma) y los VALORES de los
 * enums (el script solo imprime sus nombres; ADMIN/STAFF y UNCLAIMED/ACTIVE/INVALIDATED vienen del código y de
 * docs/CLAUDE_HANDOFF.md §12).
 * Tampoco están las tablas de las migraciones 002–010 que no toca esta función (se aplican desde migrations/).
 *
 * SEGURIDAD: igual que la otra, se niega a correr fuera de localhost o si la base no empieza con "arraigados_test",
 * porque BORRA y recrea el esquema "public". Nunca la apuntes a Neon.
 */
const BASE_SCHEMA = `
CREATE TYPE "UserRole" AS ENUM ('ADMIN','STAFF');
CREATE TYPE "PulseStatus" AS ENUM ('UNCLAIMED','ACTIVE','INVALIDATED');
-- Sin verificar contra Neon (el script db:esquema no las lista):
CREATE TABLE "Zone"(id text primary key, name text unique, "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());
CREATE TABLE "Presbytery"(id text primary key, name text not null, "zoneId" text not null references "Zone"(id), "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());
CREATE TABLE "Church"(id text primary key, name text not null, "presbyteryId" text not null references "Presbytery"(id), "createdAt" timestamp(3) not null default now(), "updatedAt" timestamp(3) not null default now());

-- Verificadas con db:esquema -------------------------------------------------------------------------------
CREATE TABLE "Package"(
  id text primary key, name text not null, price integer not null, "includedDrinks" integer not null default 0,
  active boolean not null default true, "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP, "updatedAt" timestamp(3) not null
);
CREATE UNIQUE INDEX "Package_name_key" ON "Package"(name);

CREATE TABLE "User"(
  id text primary key, email text not null, "passwordHash" text not null, name text not null,
  role "UserRole" not null default 'STAFF', active boolean not null default true,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP, "updatedAt" timestamp(3) not null
);
CREATE UNIQUE INDEX "User_email_key" ON "User"(email);

CREATE TABLE "Attendee"(
  id text primary key, "fullName" text not null, age integer,
  "churchId" text not null references "Church"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP, "updatedAt" timestamp(3) not null, "ageRange" text,
  CONSTRAINT attendee_age_range_valid CHECK (("ageRange" IS NULL) OR ("ageRange" = ANY (ARRAY['16-18','19-21','22-24','25-27','28-30','31-34','35+'])))
);
CREATE INDEX "Attendee_churchId_idx" ON "Attendee"("churchId");
CREATE INDEX "Attendee_fullName_idx" ON "Attendee"("fullName");

CREATE TABLE "Batch"(
  id text primary key, code text not null,
  "packageId" text not null references "Package"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity integer not null,
  "createdById" text not null references "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP, status text not null default 'ABIERTO',
  CONSTRAINT batch_status_valid CHECK (status = ANY (ARRAY['ABIERTO','CERRADO','CANCELADO']))
);
CREATE UNIQUE INDEX "Batch_code_key" ON "Batch"(code);
CREATE INDEX "Batch_packageId_idx" ON "Batch"("packageId");
CREATE INDEX "Batch_status_idx" ON "Batch"(status);

CREATE TABLE "Pulse"(
  id text primary key, "qrToken" text not null, "manualCode" text not null,
  "batchId" text not null references "Batch"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "packageId" text not null references "Package"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status "PulseStatus" not null default 'UNCLAIMED',
  "attendeeId" text references "Attendee"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "claimedAt" timestamp(3), "drinksUsed" integer not null default 0,
  "replacesId" text references "Pulse"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP, "updatedAt" timestamp(3) not null,
  CONSTRAINT pulse_drinks_used_non_negative CHECK ("drinksUsed" >= 0)
);
CREATE INDEX "Pulse_attendeeId_idx" ON "Pulse"("attendeeId");
CREATE INDEX "Pulse_batchId_idx" ON "Pulse"("batchId");
CREATE UNIQUE INDEX "Pulse_manualCode_key" ON "Pulse"("manualCode");
CREATE INDEX "Pulse_packageId_idx" ON "Pulse"("packageId");
CREATE UNIQUE INDEX "Pulse_qrToken_key" ON "Pulse"("qrToken");
CREATE UNIQUE INDEX "Pulse_replacesId_key" ON "Pulse"("replacesId");
CREATE INDEX "Pulse_status_idx" ON "Pulse"(status);
CREATE UNIQUE INDEX pulse_one_active_per_attendee ON "Pulse"("attendeeId") WHERE status = 'ACTIVE';

-- OJO: "packageId" NO tiene llave foránea en Neon (así lo muestra db:esquema).
CREATE TABLE "Redemption"(
  id text primary key,
  "attendeeId" text not null references "Attendee"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "pulseId" text not null references "Pulse"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "packageId" text not null, quantity integer not null default 1, location text,
  "idempotencyKey" text not null,
  "createdById" text not null references "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP
);
CREATE INDEX "Redemption_attendeeId_idx" ON "Redemption"("attendeeId");
CREATE UNIQUE INDEX "Redemption_idempotencyKey_key" ON "Redemption"("idempotencyKey");
CREATE INDEX "Redemption_pulseId_idx" ON "Redemption"("pulseId");

CREATE TABLE "AuditLog"(
  id text primary key, "actorId" text references "User"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  action text not null, "entityType" text not null, "entityId" text not null, metadata jsonb,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType","entityId");
`;

const MIGRATIONS = [
  '002_notes', '005_blocked_words', '006_announcements', '007_announcement_live', '008_package_benefits',
  '009_attendee_profile', '010_attendee_profile_keep_all', '011_rate_limit',
];
export const MIGRATION_012 = '012_staff_selfredeem';

export const applyMigration = (client: pg.Client, name: string) =>
  client.query(fs.readFileSync(path.resolve('migrations', `${name}.sql`), 'utf8'));

/** Recrea el esquema. `with012: false` deja la base "como estaba antes" (para probar la migración sobre datos viejos). */
export async function resetTeamDatabase(url: URL, { with012 = true } = {}): Promise<pg.Client> {
  assertSafeTestDatabase(url.toString());
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query(BASE_SCHEMA);
  // TEST_WITHOUT_011=1: demuestra que 012 y el código NO dependen de la migración 011 (rate limit, aún sin aplicar en Neon).
  const without011 = process.env.TEST_WITHOUT_011 === '1';
  for (const m of MIGRATIONS) if (!(without011 && m === '011_rate_limit')) await applyMigration(client, m);
  if (with012) await applyMigration(client, MIGRATION_012);
  return client;
}

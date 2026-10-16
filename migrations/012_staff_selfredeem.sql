-- 012_staff_selfredeem.sql
--
-- Pulseras para cuentas del equipo (Staff / Admin) y control del AUTOCANJE.
-- ESTADO: PREPARADA, NO APLICADA en Neon. Se prueba solo en PostgreSQL local (tests/team-pulse).
--
-- Es idempotente: se puede correr más de una vez. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 012_staff_selfredeem.sql
-- (NO uses `npm run db:migrar` a secas: aplicaría también 011_rate_limit.sql, que sigue pendiente de decisión.)
--
-- QUÉ HACE
--  1. "Redemption": el beneficiario deja de ser SIEMPRE un asistente.
--       · "attendeeId" pasa a admitir NULL (se quita el NOT NULL; la FK a "Attendee" se conserva).
--       · columna nueva "beneficiaryUserId" (FK a "User", RESTRICT).
--       · CHECK redemption_one_beneficiary: EXACTAMENTE uno de los dos tiene valor.
--     Los canjes existentes todos tienen "attendeeId", así que cumplen el CHECK sin tocarse.
--     El autocanje NO se guarda como bandera: es "beneficiaryUserId = createdById" (se deriva).
--  2. "StaffPulse": vínculo cuenta del equipo <-> pulsera. Una pulsera por cuenta y una cuenta por pulsera
--     (índices únicos parciales sobre los vínculos vigentes). Desvincular marca "unlinkedAt"; la fila queda
--     como historial de quién fue beneficiario de la pulsera.
--  3. Defensa en profundidad con dos triggers (el código ya lo valida; esto protege aunque otra ruta falle):
--       · no se puede vincular una pulsera que ya tiene "attendeeId" (pertenece a un asistente);
--       · no se puede asignar "attendeeId" a una pulsera con vínculo de equipo vigente.
--  4. "SelfRedeemSetting" (interruptor global por rol) y "SelfRedeemOverride" (excepción por persona).
--     Son tablas PROPIAS, no dependen de "AuditLog" (que el dueño puede vaciar). Defecto: NO permitido.
--
-- NO modifica precios, paquetes, saldos ni las reglas de canje de los asistentes.
-- Reversión: docs/rollback/012_staff_selfredeem_down.sql (aborta si ya hay datos del equipo).

-- 1. Redemption ------------------------------------------------------------------------------------------------
ALTER TABLE "Redemption" ALTER COLUMN "attendeeId" DROP NOT NULL;
ALTER TABLE "Redemption" ADD COLUMN IF NOT EXISTS "beneficiaryUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Redemption_beneficiaryUserId_fkey' AND conrelid = '"Redemption"'::regclass
  ) THEN
    ALTER TABLE "Redemption"
      ADD CONSTRAINT "Redemption_beneficiaryUserId_fkey"
      FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'redemption_one_beneficiary' AND conrelid = '"Redemption"'::regclass
  ) THEN
    ALTER TABLE "Redemption"
      ADD CONSTRAINT redemption_one_beneficiary
      CHECK ((("attendeeId" IS NOT NULL)::int + ("beneficiaryUserId" IS NOT NULL)::int) = 1) NOT VALID;
  END IF;
END
$$;
-- Revisa las filas que ya existían (todas tienen asistente). Si alguna violara el CHECK, esto falla y no se aplica nada más.
ALTER TABLE "Redemption" VALIDATE CONSTRAINT redemption_one_beneficiary;

CREATE INDEX IF NOT EXISTS "Redemption_beneficiaryUserId_idx"
  ON "Redemption" ("beneficiaryUserId") WHERE "beneficiaryUserId" IS NOT NULL;

-- 2. StaffPulse ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "StaffPulse" (
  "id"           TEXT         PRIMARY KEY,
  "userId"       TEXT         NOT NULL REFERENCES "User"("id")  ON DELETE RESTRICT,
  "pulseId"      TEXT         NOT NULL REFERENCES "Pulse"("id") ON DELETE RESTRICT,
  "linkedById"   TEXT         REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL,
  "unlinkedAt"   TIMESTAMP(3),
  "unlinkedById" TEXT         REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffPulse_active_user_key"  ON "StaffPulse" ("userId")  WHERE "unlinkedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "StaffPulse_active_pulse_key" ON "StaffPulse" ("pulseId") WHERE "unlinkedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "StaffPulse_pulseId_idx" ON "StaffPulse" ("pulseId");

-- 3. Triggers de defensa ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staffpulse_require_unowned_pulse() RETURNS trigger AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM "Pulse" WHERE "id" = NEW."pulseId" AND "attendeeId" IS NOT NULL) THEN
    RAISE EXCEPTION 'La pulsera ya pertenece a un asistente y no puede vincularse a una cuenta del equipo.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staffpulse_unowned ON "StaffPulse";
CREATE TRIGGER staffpulse_unowned
  BEFORE INSERT ON "StaffPulse"
  FOR EACH ROW EXECUTE FUNCTION staffpulse_require_unowned_pulse();

CREATE OR REPLACE FUNCTION pulse_block_attendee_when_team() RETURNS trigger AS $fn$
BEGIN
  IF NEW."attendeeId" IS NOT NULL AND NEW."attendeeId" IS DISTINCT FROM OLD."attendeeId"
     AND EXISTS (SELECT 1 FROM "StaffPulse" WHERE "pulseId" = NEW."id" AND "unlinkedAt" IS NULL) THEN
    RAISE EXCEPTION 'La pulsera está reservada para una cuenta del equipo y no puede asignarse a un asistente.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pulse_team_reserved ON "Pulse";
CREATE TRIGGER pulse_team_reserved
  BEFORE UPDATE OF "attendeeId" ON "Pulse"
  FOR EACH ROW EXECUTE FUNCTION pulse_block_attendee_when_team();

-- 4. Permisos de autocanje -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SelfRedeemSetting" (
  "role"        TEXT         PRIMARY KEY CHECK ("role" IN ('STAFF', 'ADMIN')),
  "allowed"     BOOLEAN      NOT NULL DEFAULT false,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  "updatedById" TEXT         REFERENCES "User"("id") ON DELETE SET NULL
);
INSERT INTO "SelfRedeemSetting" ("role", "allowed") VALUES ('STAFF', false), ('ADMIN', false)
  ON CONFLICT ("role") DO NOTHING;

CREATE TABLE IF NOT EXISTS "SelfRedeemOverride" (
  "userId"      TEXT         PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "mode"        TEXT         NOT NULL CHECK ("mode" IN ('allow', 'deny')),
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  "updatedById" TEXT         REFERENCES "User"("id") ON DELETE SET NULL
);

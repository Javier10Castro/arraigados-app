-- Reversión de migrations/012_staff_selfredeem.sql.  NO está en migrations/ a propósito: el runner (db-migrate)
-- aplica todo lo que hay ahí. Se corre a mano (psql) y SOLO con confirmación explícita.
--
-- CÓMO CORRERLA:  psql "<cadena>" -v ON_ERROR_STOP=1 -f docs/rollback/012_staff_selfredeem_down.sql
-- (sin ON_ERROR_STOP verás una cascada de errores tras el primero; igualmente no se aplica nada: es una sola transacción).
--
-- SEGURIDAD: se aborta si ya existen datos que se perderían o que no caben en el esquema anterior:
--   · canjes de equipo (attendeeId NULL)  -> el NOT NULL no se puede restaurar;
--   · vínculos de equipo (StaffPulse)      -> son el historial de beneficiarios;
--   · excepciones por persona (SelfRedeemOverride) y interruptores de autocanje que alguien activó o cambió
--     (SelfRedeemSetting con allowed = true o updatedById): son CONFIGURACIÓN que se perdería sin respaldo.
-- En ese caso primero hay que exportarlos (por ejemplo con db:respaldo-total o con \copy a CSV) y decidir qué hacer.
-- Solo para el último caso (configuración) existe una confirmación explícita DESPUÉS de exportarla:
--     SET arraigados.confirmo_perder_ajustes = 'si';      -- en la misma sesión de psql, antes de correr este archivo
-- No hay confirmación para saltarse la guarda de canjes ni de vínculos: esos datos no se pierden «a propósito».
-- Es repetible: si ya se revirtió, no falla ni cambia nada.
BEGIN;
DO $$
DECLARE
  n bigint;
BEGIN
  -- Las tablas de la 012 pueden no existir (rollback ya hecho): se consultan con SQL dinámico para que PL/pgSQL no las exija.
  IF EXISTS (SELECT 1 FROM "Redemption" WHERE "attendeeId" IS NULL) THEN
    RAISE EXCEPTION 'Hay canjes de equipo en "Redemption" (attendeeId NULL): no se revierte. Expórtalos primero.';
  END IF;
  IF to_regclass('"StaffPulse"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "StaffPulse"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Hay filas en "StaffPulse": no se revierte. Expórtalas primero.';
    END IF;
  END IF;
  IF coalesce(current_setting('arraigados.confirmo_perder_ajustes', true), '') <> 'si' THEN
    IF to_regclass('"SelfRedeemOverride"') IS NOT NULL THEN
      EXECUTE 'SELECT count(*) FROM "SelfRedeemOverride"' INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'Hay excepciones por persona en "SelfRedeemOverride": se perderían. Expórtalas (\copy "SelfRedeemOverride" TO ''overrides.csv'' CSV HEADER) y, si decides continuar, confirma con: SET arraigados.confirmo_perder_ajustes = ''si'';';
      END IF;
    END IF;
    IF to_regclass('"SelfRedeemSetting"') IS NOT NULL THEN
      EXECUTE 'SELECT count(*) FROM "SelfRedeemSetting" WHERE "allowed" OR "updatedById" IS NOT NULL' INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'Hay interruptores de autocanje activados o cambiados en "SelfRedeemSetting": se perderían. Anótalos/expórtalos y, si decides continuar, confirma con: SET arraigados.confirmo_perder_ajustes = ''si'';';
      END IF;
    END IF;
  END IF;
END
$$;
DROP TRIGGER IF EXISTS pulse_team_reserved ON "Pulse";
DROP TRIGGER IF EXISTS staffpulse_unowned ON "StaffPulse";
DROP FUNCTION IF EXISTS pulse_block_attendee_when_team();
DROP FUNCTION IF EXISTS staffpulse_require_unowned_pulse();
DROP TABLE IF EXISTS "SelfRedeemOverride";
DROP TABLE IF EXISTS "SelfRedeemSetting";
DROP TABLE IF EXISTS "StaffPulse";
DROP INDEX IF EXISTS "Redemption_beneficiaryUserId_idx";
ALTER TABLE "Redemption" DROP CONSTRAINT IF EXISTS redemption_one_beneficiary;
ALTER TABLE "Redemption" DROP CONSTRAINT IF EXISTS "Redemption_beneficiaryUserId_fkey";
ALTER TABLE "Redemption" DROP COLUMN IF EXISTS "beneficiaryUserId";
ALTER TABLE "Redemption" ALTER COLUMN "attendeeId" SET NOT NULL;
COMMIT;

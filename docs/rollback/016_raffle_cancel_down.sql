-- Reversión de 016_raffle_cancel.sql. ABORTA si ya hay rifas canceladas (para no perder esa información).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Raffle" WHERE "status" = 'CANCELLED' OR "cancelledAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay rifas canceladas; no se revierte la 016.';
  END IF;
END $$;
ALTER TABLE "Raffle" DROP CONSTRAINT IF EXISTS "raffle_cancel_consistent";
ALTER TABLE "Raffle" DROP CONSTRAINT IF EXISTS "Raffle_status_check";
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_status_check" CHECK ("status" IN ('OPEN', 'COMPLETED'));
ALTER TABLE "Raffle" DROP COLUMN IF EXISTS "cancelledById";
ALTER TABLE "Raffle" DROP COLUMN IF EXISTS "cancelledAt";

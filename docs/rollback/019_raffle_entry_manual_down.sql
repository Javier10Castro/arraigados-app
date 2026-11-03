-- Reversión de 019_raffle_entry_manual.sql. ABORTA si hay inscripciones agregadas por el equipo (se perdería esa marca).
-- Con el código actual, sin la 019 las rifas avisan «falta la migración 019» (respuestas 409, nunca 500) hasta volver a aplicarla.
DO $$
DECLARE manuales boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'RaffleEntry' AND column_name = 'manual') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "RaffleEntry" WHERE manual)' INTO manuales;
    IF manuales THEN
      RAISE EXCEPTION 'Hay inscripciones agregadas por el equipo; no se revierte la 019.';
    END IF;
  END IF;
END $$;
ALTER TABLE "RaffleEntry" DROP COLUMN IF EXISTS "addedById";
ALTER TABLE "RaffleEntry" DROP COLUMN IF EXISTS "manual";

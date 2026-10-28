-- Reversión de 018_raffle_entry_remove.sql. ABORTA si hay personas quitadas de la rifa (volverían a participar sin aviso).
-- Con el código actual, sin la 018 las rifas avisan «falta la migración 018» (respuestas 409, nunca 500) hasta volver a aplicarla.
DO $$
DECLARE quitadas boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'RaffleEntry' AND column_name = 'removedAt') THEN
    -- EXECUTE: la columna solo se consulta si existe (si no, el plan fallaría aunque la condición fuera falsa).
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "RaffleEntry" WHERE "removedAt" IS NOT NULL)' INTO quitadas;
    IF quitadas THEN
      RAISE EXCEPTION 'Hay personas quitadas de la rifa; no se revierte la 018.';
    END IF;
  END IF;
END $$;
ALTER TABLE "RaffleEntry" DROP COLUMN IF EXISTS "removedById";
ALTER TABLE "RaffleEntry" DROP COLUMN IF EXISTS "removedAt";

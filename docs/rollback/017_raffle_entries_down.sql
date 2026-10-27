-- Reversión de 017_raffle_entries.sql. ABORTA si ya hay inscripciones (las respuestas de los asistentes se perderían).
-- Con el código actual, sin la 017 las rifas avisan «falta la migración 017» (respuestas 409, nunca 500) hasta volver a aplicarla.
DO $$
BEGIN
  IF to_regclass('"RaffleEntry"') IS NOT NULL AND EXISTS (SELECT 1 FROM "RaffleEntry") THEN
    RAISE EXCEPTION 'Hay inscripciones a la rifa; no se revierte la 017.';
  END IF;
END $$;
DROP TABLE IF EXISTS "RaffleEntry";
ALTER TABLE "Raffle" DROP CONSTRAINT IF EXISTS "raffle_winning_position_valid";
ALTER TABLE "Raffle" DROP COLUMN IF EXISTS "winningPosition";

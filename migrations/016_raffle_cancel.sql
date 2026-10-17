-- 016_raffle_cancel.sql
--
-- CANCELAR UNA RIFA ABIERTA (Admin autorizado). ESTADO: PREPARADA, NO APLICADA en Neon. Se prueba solo en PostgreSQL local descartable.
-- Para aplicarla sin tocar las demás migraciones (solo con autorización):
--     npm run db:migrar -- --only 016_raffle_cancel.sql
--
-- QUÉ HACE (solo la tabla "Raffle"; no toca "RaffleWinner", rifas, ganadores ni auditoría existentes):
--   · "status" admite ahora 'OPEN', 'COMPLETED' y 'CANCELLED' (se reemplaza únicamente el CHECK de status).
--   · "cancelledAt" (opcional) y "cancelledById" (opcional, FK a "User", ON DELETE SET NULL como "createdById").
--   · CHECK de coherencia: hay "cancelledAt" si y solo si el estado es 'CANCELLED'. Todas las filas actuales (OPEN/COMPLETED,
--     sin cancelledAt) lo cumplen, así que no se modifica ninguna fila.
-- Es idempotente. Depende de 014_raffles.sql. Reversión: docs/rollback/016_raffle_cancel_down.sql (aborta si hay rifas canceladas).
-- Bloqueo: ALTER TABLE breve sobre una tabla con muy pocas filas.

ALTER TABLE "Raffle" ADD COLUMN IF NOT EXISTS "cancelledAt"   TIMESTAMP(3);
ALTER TABLE "Raffle" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;

-- Quita solo los CHECK que gobiernan "status" (en 014 el nombre lo puso PostgreSQL: "Raffle_status_check"), sin tocar los demás.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = '"Raffle"'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%' AND conname <> 'raffle_cancel_consistent'
  LOOP
    EXECUTE format('ALTER TABLE "Raffle" DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_status_check" CHECK ("status" IN ('OPEN', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "Raffle" DROP CONSTRAINT IF EXISTS "raffle_cancel_consistent";
ALTER TABLE "Raffle" ADD CONSTRAINT "raffle_cancel_consistent" CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));

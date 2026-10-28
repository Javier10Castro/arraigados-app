-- 018_raffle_entry_remove.sql
--
-- QUITAR A ALGUIEN DE LA RIFA (Admin → Rifas → Inscritos → «Quitar»), sin borrar su inscripción.
-- ESTADO: PREPARADA. Se prueba en PostgreSQL local (tests/team-pulse). REQUIERE: 017_raffle_entries.
--
-- Es idempotente. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 018_raffle_entry_remove.sql
--
-- QUÉ HACE: dos columnas NUEVAS en "RaffleEntry" (no cambia ni borra datos):
--   "removedAt"    cuándo se quitó a la persona de la rifa (NULL = sigue participando).
--   "removedById"  qué cuenta del equipo la quitó.
-- Quien está quitado NO entra al sorteo y NO puede volver a inscribirse (su fila sigue existiendo, con sus respuestas).
-- «Restaurar» vuelve las columnas a NULL. Lo ya sorteado no cambia (los ganadores son solo-INSERT).
-- Reversión: docs/rollback/018_raffle_entry_remove_down.sql (aborta si hay personas quitadas).

ALTER TABLE "RaffleEntry" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
ALTER TABLE "RaffleEntry" ADD COLUMN IF NOT EXISTS "removedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;

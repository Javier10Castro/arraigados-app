-- 019_raffle_entry_manual.sql
--
-- AGREGAR A ALGUIEN A LA RIFA DESDE ADMIN (Admin → Rifas → Inscritos → «Agregar persona»).
-- ESTADO: PREPARADA. Se prueba en PostgreSQL local (tests/team-pulse). REQUIERE: 017_raffle_entries.
--
-- Es idempotente. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 019_raffle_entry_manual.sql
--
-- QUÉ HACE: dos columnas NUEVAS en "RaffleEntry" (no cambia ni borra datos):
--   "manual"     true = la inscripción la hizo el equipo (sin respuestas), no el asistente desde su celular.
--   "addedById"  qué cuenta del equipo la agregó.
-- Reversión: docs/rollback/019_raffle_entry_manual_down.sql (aborta si hay inscripciones agregadas por el equipo).

ALTER TABLE "RaffleEntry" ADD COLUMN IF NOT EXISTS "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RaffleEntry" ADD COLUMN IF NOT EXISTS "addedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;

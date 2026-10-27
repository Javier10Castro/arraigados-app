-- 017_raffle_entries.sql
--
-- INSCRIPCIÓN A LA RIFA (con 3 preguntas sobre el congreso) y «gana la salida #N».
-- ESTADO: PREPARADA, NO APLICADA en Neon. Se prueba solo en PostgreSQL local (tests/team-pulse).
-- REQUIERE: 014_raffles (usa la tabla "Raffle"). No depende de 012 ni de 016.
--
-- Es idempotente. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 017_raffle_entries.sql
--
-- QUÉ HACE:
--   1. Tabla NUEVA "RaffleEntry": el asistente entra a la rifa de SU kit respondiendo 3 preguntas.
--      Desde esta migración SOLO participan en el sorteo quienes se inscribieron (antes: toda pulsera activa del kit).
--      · una inscripción por asistente y kit            -> UNIQUE ("attendeeId", "packageId")
--      · las respuestas no se editan: la app solo hace INSERT (si ya existe, devuelve la que hay).
--   2. Columna NUEVA "Raffle"."winningPosition" (opcional): «gana la persona que salga en el lugar N».
--      NULL = rifa anterior a esta migración (todas las salidas cuentan como ganadoras, comportamiento de siempre).
-- No modifica "Package", "Pulse", "Attendee", saldos ni precios.
-- Reversión: docs/rollback/017_raffle_entries_down.sql (aborta si ya hay inscripciones).

CREATE TABLE IF NOT EXISTS "RaffleEntry" (
  "id"            TEXT         PRIMARY KEY,
  "attendeeId"    TEXT         NOT NULL REFERENCES "Attendee"("id") ON DELETE CASCADE,
  "packageId"     TEXT         NOT NULL REFERENCES "Package"("id") ON DELETE RESTRICT,
  "pulseId"       TEXT         REFERENCES "Pulse"("id") ON DELETE SET NULL,
  "answerLiked"   TEXT         NOT NULL CHECK (char_length("answerLiked") BETWEEN 1 AND 400),
  "answerPlenary" TEXT         NOT NULL CHECK (char_length("answerPlenary") BETWEEN 1 AND 120),
  "answerLesson"  TEXT         NOT NULL CHECK (char_length("answerLesson") BETWEEN 1 AND 400),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE UNIQUE INDEX IF NOT EXISTS "RaffleEntry_attendee_package_key" ON "RaffleEntry" ("attendeeId", "packageId");
CREATE INDEX IF NOT EXISTS "RaffleEntry_package_idx" ON "RaffleEntry" ("packageId", "createdAt");

ALTER TABLE "Raffle" ADD COLUMN IF NOT EXISTS "winningPosition" INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raffle_winning_position_valid') THEN
    ALTER TABLE "Raffle" ADD CONSTRAINT "raffle_winning_position_valid"
      CHECK ("winningPosition" IS NULL OR ("winningPosition" >= 1 AND "winningPosition" <= 500));
  END IF;
END $$;

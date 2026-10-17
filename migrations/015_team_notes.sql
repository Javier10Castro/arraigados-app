-- 015_team_notes.sql
--
-- NOTAS Y "ME GUSTA" para cuentas del equipo (Staff / Admin) con pulsera vinculada, en la vista de visitante.
-- ESTADO: PREPARADA, NO APLICADA en Neon. Se prueba solo en PostgreSQL local descartable (tests/team-pulse).
--
-- Es idempotente. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 015_team_notes.sql
--
-- QUÉ HACE (toca DOS tablas con datos reales: "Note" y "NoteLike"; las filas existentes no se modifican):
--   "Note" y "NoteLike": "attendeeId" pasa a admitir NULL y se agrega "userId" (FK a "User", ON DELETE CASCADE).
--   CHECK: EXACTAMENTE uno de los dos tiene valor, así que todas las filas actuales (todas con "attendeeId") cumplen.
--   "NoteLike": índice único parcial ("noteId", "userId") para que una cuenta no dé dos likes a la misma nota
--   (el índice único de asistentes no cambia).
-- El código funciona con y sin esta migración (detecta la columna): sin ella el equipo solo LEE las notas.
-- Depende de 002_notes.sql. No depende de 012.
-- Reversión: docs/rollback/015_team_notes_down.sql (aborta si ya hay notas o likes del equipo).

ALTER TABLE "Note" ALTER COLUMN "attendeeId" DROP NOT NULL;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "note_one_author";
ALTER TABLE "Note" ADD CONSTRAINT "note_one_author" CHECK (("attendeeId" IS NULL) <> ("userId" IS NULL));
CREATE INDEX IF NOT EXISTS "Note_userId_idx" ON "Note" ("userId") WHERE "userId" IS NOT NULL;

ALTER TABLE "NoteLike" ALTER COLUMN "attendeeId" DROP NOT NULL;
ALTER TABLE "NoteLike" ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "NoteLike" DROP CONSTRAINT IF EXISTS "notelike_one_author";
ALTER TABLE "NoteLike" ADD CONSTRAINT "notelike_one_author" CHECK (("attendeeId" IS NULL) <> ("userId" IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS "NoteLike_noteId_userId_key" ON "NoteLike" ("noteId", "userId") WHERE "userId" IS NOT NULL;

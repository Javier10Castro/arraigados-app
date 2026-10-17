-- Reversión de 015_team_notes.sql. ABORTA si ya hay notas o likes de cuentas del equipo (para no perderlos).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Note" WHERE "userId" IS NOT NULL) OR EXISTS (SELECT 1 FROM "NoteLike" WHERE "userId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay notas o likes del equipo; no se revierte la 015.';
  END IF;
END $$;
DROP INDEX IF EXISTS "NoteLike_noteId_userId_key";
ALTER TABLE "NoteLike" DROP CONSTRAINT IF EXISTS "notelike_one_author";
ALTER TABLE "NoteLike" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "NoteLike" ALTER COLUMN "attendeeId" SET NOT NULL;
DROP INDEX IF EXISTS "Note_userId_idx";
ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "note_one_author";
ALTER TABLE "Note" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "Note" ALTER COLUMN "attendeeId" SET NOT NULL;

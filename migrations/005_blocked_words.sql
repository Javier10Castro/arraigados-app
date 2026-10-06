-- ===========================================================================
-- 005_blocked_words.sql · Arraigados 2K26 · Palabras bloqueadas administrables
-- ===========================================================================
--
-- QUÉ HACE
--   Crea UNA tabla NUEVA, "BlockedWord": palabras o frases que el Admin agrega
--   (desde /admin/notas) para que NO se puedan publicar en las Notas, además
--   de la lista fija de shared/moderation.ts. No toca ninguna tabla existente.
--
-- DECISIONES
--   - "word" se guarda ya normalizada por el servidor (minúsculas, sin
--     acentos, espacios simples) y es ÚNICA: agregar dos veces la misma no
--     duplica.
--   - Una palabra suelta coincide como PALABRA COMPLETA; varias palabras
--     ("vete al diablo") como frase. Ver compileBlockedWords() en
--     shared/moderation.ts.
--   - "createdById" referencia a "User" (el Admin que la agregó) con
--     ON DELETE SET NULL: borrar una cuenta no debe borrar la lista.
--   - Quitar una palabra SÍ borra la fila (es configuración, no historial); el
--     alta y la baja quedan en "AuditLog" (blocked_word.add / .remove).
--
-- IDEMPOTENTE  (CREATE ... IF NOT EXISTS)
-- CÓMO SE APLICA
--   npm run db:migrar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "BlockedWord" (
  "id"          TEXT PRIMARY KEY,
  "word"        VARCHAR(40) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlockedWord_word_key" ON "BlockedWord" ("word");

-- ===========================================================================
-- 002_notes.sql · Arraigados 2K26 · Experiencia /home (Notas)
-- ===========================================================================
--
-- QUÉ HACE
--   Crea dos tablas NUEVAS para la funcionalidad de "Notas" (frases breves y
--   temporales, concepto "Instagram Notes" adaptado a Arraigados):
--     - "Note": una nota de un asistente, máximo 60 caracteres, vigente 24h.
--     - "NoteLike": like de un asistente a una nota (relación N:N).
--
--   No toca ninguna tabla existente (Attendee, Pulse, Package, Church,
--   Presbytery, Zone, User, Redemption, AuditLog, Batch) ni su esquema.
--
-- DECISIONES DE PRODUCTO QUE MODELA ESTE ESQUEMA (documentadas, no inventadas)
--   - Autoría: "Note"."attendeeId" referencia a "Attendee", NUNCA a "User"
--     (las Notas las publican asistentes, no Staff/Admin). El servidor
--     siempre resuelve el attendeeId a partir del token de la pulsera
--     (x-pulse-token), nunca de un id que mande el cliente.
--   - Expiración: "expiresAt" = "createdAt" + 24 horas. Una nota "expirada"
--     deja de considerarse activa (expiresAt > NOW() en cada consulta), pero
--     la fila NUNCA se borra físicamente -- se conserva como histórico para
--     uso futuro (estadísticas, recopilaciones, etc.). No hay job de borrado.
--   - Cantidad: SIN LÍMITE de notas por asistente en esta v1 (decisión
--     explícita: no reutilizar el límite conceptual de 3 "instantáneas").
--   - Visibilidad: columna "visibility" preparada con los valores PRIVATE y
--     PUBLIC, pero esta v1 NUNCA escribe ni expone PUBLIC de verdad -- todas
--     las notas se crean como PRIVATE y la única lectura real implementada
--     es "mis notas". La UI puede simular una sección "comunidad" con datos
--     de prueba (mock), nunca con notas reales de otros asistentes.
--   - Guardar/favoritos: NO existe (decisión explícita del propietario,
--     reemplazada por Likes). No hay tabla "SavedNote".
--   - Likes: "NoteLike" con restricción única (noteId, attendeeId) -- un
--     asistente no puede dar más de un like a la misma nota. Permite
--     contar/():calcular likes con COUNT(*) y "¿ya di like?" con un EXISTS.
--
-- IDEMPOTENTE
--   CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CHECK añadido con
--   DROP CONSTRAINT IF EXISTS antes de recrearlo. Se puede correr más de una
--   vez sin romper nada.
--
-- CÓMO SE APLICA
--   npm run db:migrar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "Note" (
  "id"          TEXT PRIMARY KEY,
  "attendeeId"  TEXT NOT NULL REFERENCES "Attendee"("id") ON DELETE CASCADE,
  "text"        VARCHAR(60) NOT NULL,
  "visibility"  TEXT NOT NULL DEFAULT 'PRIVATE',
  "createdAt"   TIMESTAMP(3) NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL
);

ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "note_visibility_valid";
ALTER TABLE "Note" ADD CONSTRAINT "note_visibility_valid"
  CHECK ("visibility" IN ('PRIVATE', 'PUBLIC'));

ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "note_text_not_blank";
ALTER TABLE "Note" ADD CONSTRAINT "note_text_not_blank"
  CHECK (length(btrim("text")) > 0);

-- "Mis notas" ordenadas por fecha: por asistente, más reciente primero.
CREATE INDEX IF NOT EXISTS "Note_attendeeId_createdAt_idx" ON "Note" ("attendeeId", "createdAt" DESC);
-- Filtrar "activas" (expiresAt > NOW()) sin sequential scan.
CREATE INDEX IF NOT EXISTS "Note_expiresAt_idx" ON "Note" ("expiresAt");

CREATE TABLE IF NOT EXISTS "NoteLike" (
  "id"          TEXT PRIMARY KEY,
  "noteId"      TEXT NOT NULL REFERENCES "Note"("id") ON DELETE CASCADE,
  "attendeeId"  TEXT NOT NULL REFERENCES "Attendee"("id") ON DELETE CASCADE,
  "createdAt"   TIMESTAMP(3) NOT NULL
);

-- Un asistente no puede dar más de un like a la misma nota.
CREATE UNIQUE INDEX IF NOT EXISTS "NoteLike_noteId_attendeeId_key" ON "NoteLike" ("noteId", "attendeeId");
-- Contar likes de una nota rápido.
CREATE INDEX IF NOT EXISTS "NoteLike_noteId_idx" ON "NoteLike" ("noteId");

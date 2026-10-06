-- ===========================================================================
-- 006_announcements.sql · Arraigados 2K26 · Avisos del equipo + campana
-- ===========================================================================
--
-- QUÉ HACE
--   Crea DOS tablas NUEVAS (no toca ninguna existente):
--     "Announcement"       avisos que escribe el Admin (/admin/avisos) y ve cada
--                          asistente en la campana de /home.
--     "NotificationState"  una fila por asistente: cuándo abrió la campana por
--                          última vez ("seenAt"). Lo posterior a esa hora = "sin leer".
--
-- DECISIONES (entrevista del 5 oct 2026, docs/PLAN_PENDIENTES.md §10)
--   - Destino ("audience"): 'ALL' (todos) | 'Zona 1' | 'Zona 2'. La sede del
--     domingo depende de la zona (Zona 1 -> 21ra, Zona 2 -> 12va), así que
--     "por sede" y "por zona" son lo mismo ese día.
--   - Un aviso NO se edita: se RETIRA ("retiredAt") y se crea otro. Nunca se borra la fila.
--   - "publishAt" permite programar: el asistente solo lo ve cuando publishAt <= ahora.
--   - Marcar como leído = al abrir la campana (un solo "seenAt" por asistente; las
--     notificaciones de likes de la Fase 2 reutilizarán esta misma hora).
--   - "createdById" -> "User" ON DELETE SET NULL (borrar una cuenta no borra avisos).
--   - "NotificationState"."attendeeId" -> "Attendee" ON DELETE CASCADE.
--
-- IDEMPOTENTE  (CREATE ... IF NOT EXISTS)
-- CÓMO SE APLICA
--   npm run db:migrar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id"          TEXT PRIMARY KEY,
  "title"       VARCHAR(60)  NOT NULL,
  "body"        VARCHAR(280) NOT NULL,
  "audience"    VARCHAR(10)  NOT NULL DEFAULT 'ALL' CHECK ("audience" IN ('ALL', 'Zona 1', 'Zona 2')),
  "publishAt"   TIMESTAMP(3) NOT NULL,
  "retiredAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Announcement_publishAt_idx" ON "Announcement" ("publishAt" DESC);

CREATE TABLE IF NOT EXISTS "NotificationState" (
  "attendeeId" TEXT PRIMARY KEY REFERENCES "Attendee"("id") ON DELETE CASCADE,
  "seenAt"     TIMESTAMP(3) NOT NULL
);

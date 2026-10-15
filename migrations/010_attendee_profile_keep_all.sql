-- ===========================================================================
-- 010_attendee_profile_keep_all.sql · Arraigados 2K26 · Conservar las 3 selecciones del perfil
-- ===========================================================================
--
-- QUÉ HACE (solo sobre la tabla "AttendeeProfile" que creó la 009; no toca nada más)
--   1. Agrega la columna "initialsId" (estilo de iniciales elegido, ej. `i.0-2.225`).
--   2. Mueve a "initialsId" los estilos de iniciales que la 009 guardaba dentro de "avatarId".
--   3. Reemplaza la regla "AttendeeProfile_consistent": antes cada fila solo podía tener UNA cosa
--      (foto O avatar O iniciales); ahora puede tener las tres y "kind" solo dice cuál está ACTIVA:
--         kind = 'photo'    -> debe existir "photoKey"
--         kind = 'avatar'   -> debe existir "avatarId"
--         kind = 'initials' -> sin requisitos (iniciales de siempre si no hay estilo)
--
-- POR QUÉ
--   Antes, al cambiar de Foto a Avatar se BORRABA la foto. Ahora queda guardada pero inactiva
--   (nadie más la ve) y se elimina solo cuando la persona sube otra o pulsa "Eliminar foto".
--
-- IMPACTO / SEGURIDAD
--   · No borra filas ni datos. Todo corre en una sola transacción (si algo falla, no cambia nada).
--   · Idempotente: se puede correr varias veces (db:migrar corre todas las migraciones cada vez).
--   · Las fotos inactivas siguen en el almacenamiento privado "profile-photos" y solo se sirven con URL
--     firmada a quien las pide; el directorio de perfiles solo entrega a los demás lo ACTIVO.
--   · Si el código nuevo se despliega ANTES de aplicar esta migración, el perfil deja de verse (todo se
--     dibuja como siempre) hasta que se aplique; no se rompe nada más.
--
-- CÓMO VALIDARLA (en una rama de Neon, nunca primero en producción)
--   npm run db:migrar
--   SELECT "kind", "avatarId", "initialsId", "photoKey" FROM "AttendeeProfile";
-- REVERTIR (solo si no hay filas con más de una selección):
--   ALTER TABLE "AttendeeProfile" DROP CONSTRAINT "AttendeeProfile_consistent";
--   ALTER TABLE "AttendeeProfile" ADD CONSTRAINT "AttendeeProfile_consistent" CHECK (
--     ("kind" = 'photo'    AND "photoKey" IS NOT NULL AND "avatarId" IS NULL) OR
--     ("kind" = 'avatar'   AND "avatarId" IS NOT NULL AND "photoKey" IS NULL) OR
--     ("kind" = 'initials' AND "photoKey" IS NULL));
--   ALTER TABLE "AttendeeProfile" DROP COLUMN "initialsId";
-- ===========================================================================

ALTER TABLE "AttendeeProfile" ADD COLUMN IF NOT EXISTS "initialsId" VARCHAR(24);

ALTER TABLE "AttendeeProfile" DROP CONSTRAINT IF EXISTS "AttendeeProfile_consistent";

-- Estilos de iniciales que la 009 guardaba en "avatarId" (siempre empiezan con `i.`).
UPDATE "AttendeeProfile"
   SET "initialsId" = "avatarId", "avatarId" = NULL
 WHERE "kind" = 'initials' AND "avatarId" LIKE 'i.%' AND "initialsId" IS NULL;

ALTER TABLE "AttendeeProfile" ADD CONSTRAINT "AttendeeProfile_consistent" CHECK (
  ("kind" = 'photo'    AND "photoKey" IS NOT NULL) OR
  ("kind" = 'avatar'   AND "avatarId" IS NOT NULL) OR
  ("kind" = 'initials')
);

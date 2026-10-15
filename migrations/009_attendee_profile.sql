-- ===========================================================================
-- 009_attendee_profile.sql · Arraigados 2K26 · Foto de perfil del asistente
-- ===========================================================================
--
-- QUÉ HACE
--   Crea UNA tabla NUEVA (no toca ninguna existente):
--     "AttendeeProfile"  una fila por asistente que personalizó su imagen de perfil.
--
--       attendeeId  -> "Attendee"(id) ON DELETE CASCADE (si se borra al asistente, se borra su perfil)
--       kind        'photo' (foto propia) | 'avatar' (galería) | 'initials' (iniciales)
--       avatarId    kind = 'avatar': id de la galería o diseño propio (`c.rostro.forma.tono.claridad`);
--                   kind = 'initials': NULL (iniciales de siempre) o estilo elegido (`i.palabras.color`);
--                   ver shared/profile.ts. Texto corto, nunca una imagen.
--       photoKey    llave del archivo en Netlify Blobs (store "profile-photos"), solo cuando kind = 'photo'
--       updatedAt   última vez que cambió
--
--   Sin fila = el asistente no ha elegido nada: se ve igual que hoy (ajuste global de avatar).
--   La foto NUNCA se guarda en Postgres: solo su llave. Se sirve con URL firmada y caducidad.
--
-- POR QUÉ UNA TABLA Y NO COLUMNAS EN "Attendee"
--   "Attendee" la comparte la app original (Next.js); agregarle columnas arriesga a esa app.
--
-- NOTA: la regla de consistencia de abajo es la ORIGINAL; la migración 010 la reemplaza (las 3 selecciones
--   -foto, avatar, iniciales- se conservan a la vez y `kind` solo marca cuál está activa).
--
-- SEGURO / IDEMPOTENTE  (CREATE ... IF NOT EXISTS; no borra ni modifica datos)
-- SI SE APLICA TARDE: el código funciona sin la tabla (todo se ve como hoy; guardar responde
--   "todavía no está disponible"). Para revertir:  DROP TABLE "AttendeeProfile";
-- CÓMO SE APLICA
--   npm run db:migrar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "AttendeeProfile" (
  "attendeeId" TEXT PRIMARY KEY REFERENCES "Attendee"("id") ON DELETE CASCADE,
  "kind"       VARCHAR(10) NOT NULL CHECK ("kind" IN ('photo', 'avatar', 'initials')),
  "avatarId"   VARCHAR(24),
  "photoKey"   VARCHAR(120),
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendeeProfile_consistent" CHECK (
    ("kind" = 'photo'  AND "photoKey" IS NOT NULL AND "avatarId" IS NULL) OR
    ("kind" = 'avatar' AND "avatarId" IS NOT NULL AND "photoKey" IS NULL) OR
    ("kind" = 'initials' AND "photoKey" IS NULL)
  )
);

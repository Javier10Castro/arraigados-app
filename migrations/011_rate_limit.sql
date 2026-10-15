-- ===========================================================================
-- 011_rate_limit.sql · Arraigados 2K26 · Contadores del límite de frecuencia (rate limiting)
-- ===========================================================================
--
-- QUÉ HACE
--   Crea UNA tabla nueva, "RateLimit", que guarda un contador por clave y ventana de tiempo
--   (ej. "login_pair:<huella>" -> 3 intentos, vence en 12 minutos). No toca ninguna tabla existente.
--
-- POR QUÉ
--   Las Netlify Functions son efímeras y hay muchas instancias a la vez: un contador en memoria no
--   protege (cada instancia cuenta por su lado). Neon ya es la base compartida del proyecto, así que
--   los contadores viven aquí y se actualizan con UN solo INSERT ... ON CONFLICT DO UPDATE atómico
--   (ver server/rateLimit.ts). Se guarda UNA fila por clave, nunca una fila por solicitud.
--
-- QUÉ GUARDA (y qué NO)
--   · "key"     : nombre de la regla + huella HMAC (con SESSION_SECRET) de la IP, del correo o del token.
--                 NUNCA se guarda la IP, el correo, la contraseña ni el token en claro.
--   · "count"   : cuántos usos lleva en la ventana actual.
--   · "resetAt" : cuándo termina la ventana (a partir de ahí el contador empieza de cero solo).
--   Las filas vencidas se borran solas (limpieza ocasional dentro de server/rateLimit.ts).
--
-- IMPACTO / SEGURIDAD
--   · Idempotente (CREATE TABLE IF NOT EXISTS): db:migrar corre todas las migraciones cada vez.
--   · No hay llaves foráneas ni datos de personas; borrar la tabla solo reinicia los contadores.
--   · Si el código nuevo se despliega ANTES de aplicar esta migración, el límite no se aplica
--     (se registra "[ratelimit] ... no existe" en los logs de Netlify) y el resto de la app funciona.
--     Aplícala ANTES de desplegar. Ver docs/RATE_LIMITING.md.
--   · La tabla no es de Prisma (el Next.js no la conoce). Si algún día ese proyecto corre
--     `prisma migrate`/`db pull`, verá una tabla ajena; las migraciones 001-010 ya tienen el mismo caso.
--
-- CÓMO VALIDARLA (en una rama de Neon, nunca primero en producción)
--   npm run db:migrar
--   SELECT * FROM "RateLimit" LIMIT 5;          -- vacía hasta que haya tráfico
-- REVERTIR (solo reinicia contadores; el código deja de limitar pero sigue funcionando):
--   DROP TABLE IF EXISTS "RateLimit";
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "RateLimit" (
  "key"     VARCHAR(80)  PRIMARY KEY,
  "count"   INTEGER      NOT NULL CHECK ("count" >= 0),
  "resetAt" TIMESTAMPTZ  NOT NULL
);

-- ===========================================================================
-- 007_announcement_live.sql · Arraigados 2K26 · Etiqueta "EN VIVO" en avisos
-- ===========================================================================
--
-- QUÉ HACE
--   Agrega UNA columna a "Announcement" (creada en 006): "live" BOOLEAN. Si es true, el aviso se
--   muestra en la campana con la etiqueta roja "EN VIVO" (ej. "Ya empezó el culto").
--   Por defecto false: los avisos que ya existan no cambian.
--
-- IDEMPOTENTE  (ADD COLUMN IF NOT EXISTS)
-- CÓMO SE APLICA
--   npm run db:migrar        (ANTES de publicar el código que la usa)
-- ===========================================================================

ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "live" BOOLEAN NOT NULL DEFAULT false;

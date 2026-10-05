-- ===========================================================================
-- 003_menu.sql · Arraigados 2K26 · Menú de alimentos administrable
-- ===========================================================================
--
-- QUÉ HACE
--   Crea dos tablas NUEVAS: "Venue" (catálogo FIJO de sedes del Congreso) y
--   "Dish" (platillos del menú, administrables desde /admin/menu). No toca
--   ninguna tabla existente.
--
-- DECISIONES DE PRODUCTO QUE MODELA ESTE ESQUEMA (3 oct 2026)
--   - "Venue" es un catálogo propio, NO reutiliza "Church" -- 12va/21ra IAFCJ
--     son sedes del Congreso, no iglesias dentro de la jerarquía eclesiástica
--     Zone -> Presbytery -> Church.
--   - "Venue" es FIJO por decisión explícita del cliente: solo existen y
--     existirán '12va IAFCJ' y '21ra IAFCJ'. /admin/menu NO tiene CRUD de
--     sedes -- únicamente un selector con estas dos al crear/editar un
--     platillo. Por eso "Venue" no tiene columna "active": no hay forma de
--     desactivar una sede desde la app, son las dos de siempre.
--   - "Dish"."imageKey" guarda SOLO la referencia al archivo en Netlify Blobs
--     (store "dish-photos") -- la imagen en sí nunca vive en Postgres.
--     NULL = platillo sin foto todavía.
--   - "available" controla si el platillo se muestra como disponible en
--     Home/admin; el platillo NUNCA se borra al quedar sin stock, solo se
--     marca no disponible (mismo criterio que Instant: no se borra
--     físicamente lo que ya fue parte de la experiencia). Sí existe DELETE
--     real desde /admin/menu (borrar un platillo creado por error), pero es
--     distinto de "agotarse" -- ver server/dishes.ts.
--
-- IDEMPOTENTE: CREATE TABLE/INDEX IF NOT EXISTS, los 2 INSERT de sedes
--   iniciales usan ON CONFLICT DO NOTHING. Se puede correr más de una vez.
--
-- CÓMO SE APLICA
--   npm run db:migrar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "Venue" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Venue_name_key" ON "Venue" ("name");

CREATE TABLE IF NOT EXISTS "Dish" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price"       INTEGER NOT NULL,   -- centavos, igual que Package.price
  "available"   BOOLEAN NOT NULL DEFAULT true,
  "venueId"     TEXT NOT NULL REFERENCES "Venue"("id"),
  "imageKey"    TEXT,               -- key en Netlify Blobs, store "dish-photos"
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

ALTER TABLE "Dish" DROP CONSTRAINT IF EXISTS "dish_name_not_blank";
ALTER TABLE "Dish" ADD CONSTRAINT "dish_name_not_blank"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "Dish" DROP CONSTRAINT IF EXISTS "dish_price_not_negative";
ALTER TABLE "Dish" ADD CONSTRAINT "dish_price_not_negative"
  CHECK ("price" >= 0);

CREATE INDEX IF NOT EXISTS "Dish_venueId_idx" ON "Dish" ("venueId");
CREATE INDEX IF NOT EXISTS "Dish_available_idx" ON "Dish" ("available");
-- Orden de despliegue en el carrusel/admin: por sede, luego por sortOrder.
CREATE INDEX IF NOT EXISTS "Dish_venueId_sortOrder_idx" ON "Dish" ("venueId", "sortOrder");

-- Semilla de las 2 sedes FIJAS. Ids literales (excepción deliberada al
-- patrón newId(), igual que InstantConfig.id = "default") porque esta
-- migración las inserta sin pasar por la app -- no habrá una tercera.
INSERT INTO "Venue" (id, name, "sortOrder", "createdAt", "updatedAt") VALUES
  ('venue-12va-iafcj', '12va IAFCJ', 0, (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')),
  ('venue-21ra-iafcj', '21ra IAFCJ', 1, (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc'))
ON CONFLICT (name) DO NOTHING;

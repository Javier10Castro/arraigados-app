-- ===========================================================================
-- 004_merch.sql · Arraigados 2K26 · Mercancía oficial administrable
-- ===========================================================================
--
-- QUÉ HACE
--   Crea dos tablas NUEVAS: "MerchItem" (artículos de la vitrina de /home,
--   administrables desde /admin/merch) y "MerchImage" (sus fotos -- UN
--   artículo puede tener VARIAS, a diferencia de "Dish" que solo tiene una).
--   No toca ninguna tabla existente, ni "Dish"/"Venue" de 003_menu.sql.
--
-- DECISIONES DE PRODUCTO QUE MODELA ESTE ESQUEMA (3 oct 2026)
--   - Mercancía NUNCA se vende dentro de la app (confirmado explícitamente
--     por el cliente): por eso "MerchItem" no tiene columnas de inventario,
--     stock, carrito ni pedidos -- es un catálogo puramente EDITORIAL.
--   - "price" es NULLABLE a propósito: NULL = "Por definir" (todavía no hay
--     precio real). A diferencia de "Dish"."price" (NOT NULL, el menú de
--     alimentos sí tiene precio desde el día uno), aquí sí puede faltar.
--   - "availability" es un enum de texto ('tbd' | 'onsite'), NO un boolean
--     "available" como "Dish": no modela disponibilidad de STOCK, solo si ya
--     se sabe que el artículo SÍ habrá en el congreso ('onsite') o si
--     todavía no se confirma ('tbd'). Nunca existirá un tercer valor
--     "agotado" -- eso sería inventario, fuera de alcance.
--   - "MerchImage" es una tabla aparte (1 a N) en vez de una sola columna
--     "imageKey" como "Dish": la vitrina de Merch sí necesita varias fotos
--     por artículo (ángulos distintos, detalle del estampado, etc.), a
--     diferencia del menú de alimentos. Cada fila es una foto en Netlify
--     Blobs (store "merch-photos"); "sortOrder" decide el orden en la
--     galería/carrusel de fotos de ese artículo. ON DELETE CASCADE: borrar
--     un MerchItem borra sus filas de MerchImage (el archivo en Blobs se
--     borra aparte, desde server/merch.ts, antes de que esto corra).
--
-- IDEMPOTENTE: CREATE TABLE/INDEX IF NOT EXISTS. Se puede correr más de una vez.
--
-- CÓMO SE APLICA
--   npm run db:migrar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "MerchItem" (
  "id"           TEXT PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "description"  TEXT NOT NULL,
  "price"        INTEGER,                      -- centavos; NULL = "Por definir"
  "availability" TEXT NOT NULL DEFAULT 'tbd',   -- 'tbd' | 'onsite'
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);

ALTER TABLE "MerchItem" DROP CONSTRAINT IF EXISTS "merch_item_name_not_blank";
ALTER TABLE "MerchItem" ADD CONSTRAINT "merch_item_name_not_blank"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "MerchItem" DROP CONSTRAINT IF EXISTS "merch_item_price_not_negative";
ALTER TABLE "MerchItem" ADD CONSTRAINT "merch_item_price_not_negative"
  CHECK ("price" IS NULL OR "price" >= 0);

ALTER TABLE "MerchItem" DROP CONSTRAINT IF EXISTS "merch_item_availability_valid";
ALTER TABLE "MerchItem" ADD CONSTRAINT "merch_item_availability_valid"
  CHECK ("availability" IN ('tbd', 'onsite'));

CREATE INDEX IF NOT EXISTS "MerchItem_sortOrder_idx" ON "MerchItem" ("sortOrder");

CREATE TABLE IF NOT EXISTS "MerchImage" (
  "id"          TEXT PRIMARY KEY,
  "merchItemId" TEXT NOT NULL REFERENCES "MerchItem"("id") ON DELETE CASCADE,
  "imageKey"    TEXT NOT NULL,   -- key en Netlify Blobs, store "merch-photos"
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "MerchImage_merchItemId_sortOrder_idx" ON "MerchImage" ("merchItemId", "sortOrder");

-- Semilla: los 4 artículos de referencia que ya se mostraban en /home desde
-- el catálogo local (src/data/merch.ts) -- mismo texto, mismo orden. SIN
-- fotos todavía (las fotos viven en Blobs, no se pueden sembrar por SQL):
-- tras aplicar esta migración y desplegar, hay que volver a subir las 4
-- fotos una vez desde /admin/merch (2 minutos) para que la vitrina se vea
-- exactamente igual que antes de este cambio. Mientras tanto, cada tarjeta
-- muestra su ícono de "foto pendiente" en vez de un error.
INSERT INTO "MerchItem" (id, name, description, price, availability, "sortOrder", "createdAt", "updatedAt") VALUES
  ('merch-vaso-reutilizable', 'Vaso reutilizable', 'Vaso con tapa y popote, con la identidad de Red Juvenil Tijuana. Material, capacidad y acabado final todavía en definición.', NULL, 'tbd', 0, (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')),
  ('merch-bolsa-tote', 'Bolsa tote', 'Tote color crema con el logotipo de Arraigados 2K26. Tamaño, material y cantidad disponible todavía en definición.', NULL, 'tbd', 1, (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')),
  ('merch-aplicaciones-graficas', 'Aplicaciones gráficas', 'Stickers con la identidad de Arraigados 2K26: el óvalo "Arraigados", "RJDT" y "En Él" (Colosenses 2:6-7). Formato, tamaño y contenido todavía por definir.', NULL, 'tbd', 2, (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')),
  ('merch-pulsera-rjdt', 'Pulsera RJDT', 'Pulsera tejida con "RJDT" en la identidad de Red Juvenil Tijuana. Material y ajuste todavía en definición.', NULL, 'tbd', 3, (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc'))
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- 008_package_benefits.sql · Arraigados 2K26 · Beneficios de cada kit (administrables)
-- ===========================================================================
--
-- QUÉ HACE
--   Crea UNA tabla NUEVA, "PackageBenefit": la lista "Incluye" de cada kit
--   (Package). Antes era una lista fija en el código (src/data/app.ts ->
--   packageContent); ahora el Admin la edita en /admin/beneficios.
--   NO toca ninguna tabla existente. Las "aguas frescas" siguen saliendo de
--   Package."includedDrinks" (no son un beneficio de esta tabla).
--
-- SEMILLA (una sola vez)
--   Al CREAR la tabla se cargan los beneficios que ya tenían los 3 kits
--   ("Kit - A", "Kit - B", "Especial"). Si la tabla ya existe, esta migración
--   NO vuelve a cargar nada: así, correr `npm run db:migrar` otra vez no
--   resucita beneficios que el Admin haya borrado o cambiado.
--
-- IDEMPOTENTE · CÓMO SE APLICA
--   npm run db:migrar        (ANTES de publicar el código que la usa; si aún
--   no se aplica, la app sigue mostrando la lista fija de siempre)
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public."PackageBenefit"') IS NULL THEN
    CREATE TABLE "PackageBenefit" (
      "id"        TEXT PRIMARY KEY,
      "packageId" TEXT NOT NULL REFERENCES "Package"("id") ON DELETE CASCADE,
      "label"     VARCHAR(80) NOT NULL CHECK (length(btrim("label")) > 0),
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    INSERT INTO "PackageBenefit" ("id", "packageId", "label", "sortOrder", "createdAt", "updatedAt")
    SELECT 'ben-' || substr(md5(p."id" || '|' || s."label"), 1, 20), p."id", s."label", s."ord",
           (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')
      FROM "Package" p
      JOIN (VALUES
        ('Kit - A',  0, 'Botella de agua'),
        ('Kit - A',  1, 'Rifa categoría 1'),
        ('Kit - B',  0, 'Bote personalizado'),
        ('Kit - B',  1, 'Botella de agua'),
        ('Kit - B',  2, 'Rifa categoría 2'),
        ('Especial', 0, 'Bote personalizado'),
        ('Especial', 1, 'Tote bag'),
        ('Especial', 2, 'Botella de agua'),
        ('Especial', 3, '1 entrada (acceso general al congreso)'),
        ('Especial', 4, '2 stickers'),
        ('Especial', 5, 'Rifa especial')
      ) AS s("pkg", "ord", "label") ON s."pkg" = p."name";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PackageBenefit_packageId_sortOrder_idx" ON "PackageBenefit" ("packageId", "sortOrder");

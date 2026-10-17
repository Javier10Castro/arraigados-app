-- 013_team_discount.sql
--
-- Configuración de DESCUENTOS DEL EQUIPO (Staff / Admin) para la simulación de ingresos del Dashboard.
-- ESTADO: PREPARADA, NO APLICADA en Neon. Se prueba solo en PostgreSQL local (tests/team-pulse).
--
-- Es idempotente. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 013_team_discount.sql
--
-- QUÉ HACE: crea UNA tabla pequeña con una fila por rol (STAFF, ADMIN):
--   "type"  'percent' | 'fixed'
--   "value" entero NO negativo:
--             percent -> puntos base (basis points): 1250 = 12.50 %; máximo 10000 (100 %)
--             fixed   -> centavos de MXN: 5000 = $50.00 (misma unidad que "Package"."price")
--   Valor inicial 0 en ambos roles (sin descuento).
-- Es SOLO una simulación: no toca "Package", "Redemption", saldos ni precios históricos, y no cobra nada.
-- No depende de la migración 012 (solo referencia "User").
-- Reversión: docs/rollback/013_team_discount_down.sql

CREATE TABLE IF NOT EXISTS "TeamDiscountSetting" (
  "role"        TEXT         PRIMARY KEY CHECK ("role" IN ('STAFF', 'ADMIN')),
  "type"        TEXT         NOT NULL DEFAULT 'percent' CHECK ("type" IN ('percent', 'fixed')),
  "value"       INTEGER      NOT NULL DEFAULT 0 CHECK ("value" >= 0),
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  "updatedById" TEXT         REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT team_discount_percent_max CHECK ("type" <> 'percent' OR "value" <= 10000)
);

INSERT INTO "TeamDiscountSetting" ("role", "type", "value") VALUES ('STAFF', 'percent', 0), ('ADMIN', 'percent', 0)
  ON CONFLICT ("role") DO NOTHING;

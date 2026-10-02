-- ===========================================================================
-- 001_batch_status.sql · Arraigados 2K26 · Etapa 3 (Lotes)
-- ===========================================================================
--
-- ÚNICO cambio de esquema de toda la Etapa 3, autorizado de forma explícita.
-- No se toca ninguna otra tabla, columna, índice ni dato.
--
-- QUÉ HACE
--   Agrega "Batch"."status" como TEXT con default 'ABIERTO' y un CHECK que
--   admite exactamente tres valores: ABIERTO, CERRADO, CANCELADO.
--
-- POR QUÉ TEXT + CHECK y no un ENUM de Postgres
--   El proyecto Next.js (Prisma) es solo referencia y su schema.prisma ya
--   está desfasado de la base real (ver docs/CLAUDE_HANDOFF.md §12). Crear un
--   tipo ENUM en Postgres implica DROP TYPE para agregar valores, lo que hace
--   lasampliaciones futuras frágiles. TEXT + CHECK replica el patrón que ya
--   usa la propia base para "Attendee"."ageRange" (text + CHECK) y permite
--   agregar estados con un solo ALTER TABLE ... DROP/ADD CONSTRAINT.
--
-- ESTADOS
--   ABIERTO    -> único estado que la Etapa 3 escribe. Es el default.
--   CERRADO    -> reservado. La Etapa 3 NO implementa el botón "Cerrar lote".
--   CANCELADO  -> reservado. Mismo caso.
--   Los dos valores reservados existen solo para que la arquitectura quede
--   preparada; ninguna función de la app los escribe todavía.
--
-- INDICE
--   "Batch_status_idx" para que el listado pueda filtrar por estado sin
--   sequential scan cuando la tabla crezca.
--
-- IDEMPOTENTE
--   Se puede correr las veces que sea: ADD COLUMN IF NOT EXISTS, DROP
--   CONSTRAINT IF EXISTS antes de re-crear el CHECK, y CREATE INDEX IF NOT
--   EXISTS. En una tabla con lotes existentes la columna se llena sola con
--   'ABIERTO' (no hay que backfill manual).
--
-- CÓMO SE APLICA
--   npm run db:migrar
--
-- NOTA SOBRE EL RESTO DEL ESQUEMA
--   Este archivo NO replica 0001_init del Next.js: la base ya tiene todas las
--   tablas de lotes y pulseras (Batch, Pulse, PulseStatus, índices únicos y el
--   índice parcial pulse_one_active_per_attendee). No volver a correr esas
--   migraciones aquí.
-- ===========================================================================

ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ABIERTO';

ALTER TABLE "Batch" DROP CONSTRAINT IF EXISTS "batch_status_valid";
ALTER TABLE "Batch" ADD CONSTRAINT "batch_status_valid"
  CHECK ("status" IN ('ABIERTO', 'CERRADO', 'CANCELADO'));

CREATE INDEX IF NOT EXISTS "Batch_status_idx" ON "Batch" ("status");

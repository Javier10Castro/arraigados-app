-- 014_raffles.sql
--
-- RIFAS por kit (Kit-A, Kit-B, Especial) con sorteo en el SERVIDOR.
-- ESTADO: PREPARADA, NO APLICADA en Neon. Se prueba solo en PostgreSQL local (tests/team-pulse).
--
-- Es idempotente. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 014_raffles.sql
--
-- QUÉ HACE: dos tablas NUEVAS (no toca ninguna existente; no depende de la migración 012):
--   "Raffle"        una rifa = un kit + una edición. Una edición nueva es una FILA NUEVA (el historial se conserva).
--                   "targetWinners" = cuántos ganadores se buscan; "status" OPEN | COMPLETED.
--   "RaffleWinner"  un ganador por sorteo. Es append-only: la app nunca actualiza ni borra filas.
--                   Guarda el nombre tal como era al sortear ("winnerName"), quién sorteó y en qué orden.
-- Garantías de la propia base (defensa en profundidad; el código también las valida):
--   · un asistente solo puede ganar UNA vez por rifa     -> UNIQUE ("raffleId", "attendeeId")
--   · el orden de ganadores no se repite                 -> UNIQUE ("raffleId", "position")
--   · reintento / doble clic del mismo sorteo            -> UNIQUE ("raffleId", "drawKey")  (idempotencia)
-- No modifica "Package", "Redemption", saldos ni precios.
-- Reversión: docs/rollback/014_raffles_down.sql (borra las rifas; úsala solo si NO hay sorteos reales).

CREATE TABLE IF NOT EXISTS "Raffle" (
  "id"            TEXT         PRIMARY KEY,
  "packageId"     TEXT         NOT NULL REFERENCES "Package"("id") ON DELETE RESTRICT,
  "edition"       INTEGER      NOT NULL DEFAULT 1 CHECK ("edition" >= 1),
  "name"          TEXT         NOT NULL,
  "targetWinners" INTEGER      NOT NULL CHECK ("targetWinners" >= 1 AND "targetWinners" <= 500),
  "status"        TEXT         NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'COMPLETED')),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  "createdById"   TEXT         REFERENCES "User"("id") ON DELETE SET NULL,
  "completedAt"   TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Raffle_package_edition_key" ON "Raffle" ("packageId", "edition");

CREATE TABLE IF NOT EXISTS "RaffleWinner" (
  "id"         TEXT         PRIMARY KEY,
  "raffleId"   TEXT         NOT NULL REFERENCES "Raffle"("id") ON DELETE RESTRICT,
  "attendeeId" TEXT         REFERENCES "Attendee"("id") ON DELETE SET NULL,
  "pulseId"    TEXT         REFERENCES "Pulse"("id") ON DELETE SET NULL,
  "position"   INTEGER      NOT NULL CHECK ("position" >= 1),
  "winnerName" TEXT         NOT NULL,
  "extra"      BOOLEAN      NOT NULL DEFAULT false,
  "drawKey"    TEXT         NOT NULL,
  "drawnAt"    TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  "drawnById"  TEXT         REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "RaffleWinner_raffle_attendee_key" ON "RaffleWinner" ("raffleId", "attendeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RaffleWinner_raffle_position_key" ON "RaffleWinner" ("raffleId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "RaffleWinner_raffle_drawkey_key"  ON "RaffleWinner" ("raffleId", "drawKey");

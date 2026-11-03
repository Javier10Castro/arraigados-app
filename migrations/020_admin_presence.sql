-- 020_admin_presence.sql
--
-- «EN LÍNEA» Y MENSAJES ENTRE ADMIN (esquina del panel de Admin).
-- ESTADO: PREPARADA. Se prueba en PostgreSQL local (tests/team-pulse). No depende de otras migraciones de este repo.
--
-- Es idempotente. Para aplicarla sin tocar las demás migraciones:
--     npm run db:migrar -- --only 020_admin_presence.sql
--
-- QUÉ HACE: dos tablas NUEVAS (no toca ninguna existente):
--   "AdminPresence"  una fila por cuenta Admin: en qué sección del panel está y cuándo se vio por última vez
--                    (el panel avisa cada ~15 s mientras está abierto). «En línea» = visto hace menos de 45 s.
--   "AdminMessage"   mensajes cortos entre cuentas Admin (máx. 300 caracteres), con cuándo se leyeron.
-- Reversión: docs/rollback/020_admin_presence_down.sql (borra ambas tablas; los mensajes se pierden).

CREATE TABLE IF NOT EXISTS "AdminPresence" (
  "userId"   TEXT         PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "path"     TEXT         NOT NULL CHECK (char_length("path") BETWEEN 1 AND 200),
  "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS "AdminMessage" (
  "id"         TEXT         PRIMARY KEY,
  "fromUserId" TEXT         REFERENCES "User"("id") ON DELETE SET NULL,
  "fromName"   TEXT         NOT NULL,
  "toUserId"   TEXT         NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "body"       TEXT         NOT NULL CHECK (char_length("body") BETWEEN 1 AND 300),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  "readAt"     TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "AdminMessage_to_unread_idx" ON "AdminMessage" ("toUserId", "readAt", "createdAt");

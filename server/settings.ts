import { NOW_UTC, newId, query, withTransaction } from './db';
import { DEFAULT_AVATAR_MODE, isAvatarMode, type AppSettings, type AvatarMode } from '../shared/api';

/**
 * Configuración global de la app, SIN tablas nuevas.
 *
 * No existía ninguna infraestructura de "settings" (ni tabla, ni archivo).
 * Para un solo valor se reutiliza el mismo patrón que ya usa la contraseña
 * temporal (server/auth.ts): el valor vigente es la ÚLTIMA entrada de
 * "AuditLog" con:
 *
 *   entityType = 'Setting'   entityId = <nombre>   action = 'setting.update'
 *   metadata   = { value, previous }
 *
 * Ventajas: cero cambios de esquema, cada cambio queda auditado con quién y
 * cuándo, y `npm run db:limpiar-pruebas` NO lo borra (solo borra los
 * entityType de TEST_AUDIT_TYPES en scripts/_db.mjs).
 * Sin ninguna entrada → valor por defecto (avatarMode = 'blobatar').
 *
 * Si algún día hay muchas configuraciones, conviene migrar a una tabla
 * "AppSetting(key, value)"; hoy sería arquitectura de más para un booleano.
 */

export class SettingsError extends Error {}

const SETTING_ACTION = 'setting.update';
const SETTING_TYPE = 'Setting';

async function latest(name: string): Promise<string | null> {
  const { rows } = await query<{ value: string | null }>(
    `SELECT metadata->>'value' AS value
       FROM "AuditLog"
      WHERE "entityType" = $1 AND "entityId" = $2 AND action = $3
      ORDER BY "createdAt" DESC, id DESC
      LIMIT 1`,
    [SETTING_TYPE, name, SETTING_ACTION],
  );
  return rows[0]?.value ?? null;
}

export async function getSettings(): Promise<AppSettings> {
  const raw = await latest('avatarMode');
  return { avatarMode: isAvatarMode(raw) ? raw : DEFAULT_AVATAR_MODE };
}

/** Solo lo llama /api/admin/settings, después de authorize(['ADMIN']). */
export async function setAvatarMode(actorId: string, value: unknown): Promise<AppSettings> {
  if (!isAvatarMode(value)) throw new SettingsError('Modo de avatar inválido. Usa "blobatar" o "initials".');
  const mode: AvatarMode = value;
  const current = (await getSettings()).avatarMode;
  if (current === mode) return { avatarMode: mode }; // sin cambios: no se escribe nada
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, $3, $4, 'avatarMode', $5::jsonb, ${NOW_UTC})`,
      [newId(), actorId, SETTING_ACTION, SETTING_TYPE, JSON.stringify({ value: mode, previous: current })],
    );
  });
  return { avatarMode: mode };
}

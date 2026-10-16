import { NOW_UTC, newId, query, withTransaction } from './db';
import { isOwnerEmail } from './owner';
import type {
  SelfRedeemMode,
  SelfRedeemOverview,
  SelfRedeemSettings,
  SelfRedeemUserRow,
  StaffRole,
} from '../shared/api';

/**
 * Permiso de AUTOCANJE: que una cuenta del equipo (Staff/Admin) escanee SU PROPIA pulsera para descontarse una agua.
 *
 * Persistencia: tablas propias "SelfRedeemSetting" (interruptor global por rol) y "SelfRedeemOverride" (excepción por
 * persona), de la migración 012. NO se guardan en "AuditLog": el dueño puede vaciar la bitácora y un bloqueo individual
 * desaparecería (la persona volvería a heredar el permiso global). La bitácora solo registra quién cambió qué.
 *
 * Precedencia (la decide SIEMPRE el servidor, con el rol y el id de la sesión verificada):
 *   1. excepción individual: 'allow' o 'deny'  -> manda;
 *   2. interruptor global del rol              -> si no hay excepción;
 *   3. cualquier otra cosa (sin fila, tabla ausente, error, rol raro) -> NO permitido.
 *
 * Esto NO es un permiso administrativo y NO afecta a que OTRO miembro del equipo canjee la pulsera de esta persona.
 */

export class SelfRedeemError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type Decision = { allowed: boolean; source: 'override' | 'global' | 'default' };
type Run = (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

const ROLES: StaffRole[] = ['STAFF', 'ADMIN'];
const isRole = (v: unknown): v is StaffRole => v === 'STAFF' || v === 'ADMIN';

/**
 * ¿Puede `userId` (con este `role` de la sesión) canjearse a sí mismo? `run` permite evaluarlo DENTRO de la transacción del
 * canje. Cualquier fallo se traduce en "no" (cierra por defecto) y se registra sin datos personales.
 */
export async function selfRedeemDecision(run: Run, userId: string, role: unknown): Promise<Decision> {
  if (!isRole(role) || !userId) return { allowed: false, source: 'default' };
  try {
    const { rows } = await run(
      `SELECT (SELECT "mode" FROM "SelfRedeemOverride" WHERE "userId" = $1) AS mode,
              (SELECT "allowed" FROM "SelfRedeemSetting" WHERE "role" = $2) AS allowed`,
      [userId, role],
    );
    const row = rows[0];
    if (row?.mode === 'allow') return { allowed: true, source: 'override' };
    if (row?.mode === 'deny') return { allowed: false, source: 'override' };
    if (row?.allowed === true) return { allowed: true, source: 'global' };
    return { allowed: false, source: row?.allowed === false ? 'global' : 'default' };
  } catch (err) {
    console.error('[selfredeem] no se pudo leer el permiso de autocanje (se deniega):', err instanceof Error ? err.message : err);
    return { allowed: false, source: 'default' };
  }
}

export async function getGlobalSettings(): Promise<SelfRedeemSettings> {
  const out: SelfRedeemSettings = { STAFF: false, ADMIN: false };
  try {
    const { rows } = await query<{ role: string; allowed: boolean }>(`SELECT "role", "allowed" FROM "SelfRedeemSetting"`);
    for (const r of rows) if (isRole(r.role)) out[r.role] = r.allowed === true;
  } catch (err) {
    console.error('[selfredeem] no se pudo leer la configuración global (se muestra apagada):', err instanceof Error ? err.message : err);
  }
  return out;
}

/** Para la pantalla de Admin. La lista por persona y sus excepciones SOLO se entregan a la cuenta propietaria. */
export async function getOverview(actorEmail: string | null | undefined): Promise<SelfRedeemOverview> {
  const settings = await getGlobalSettings();
  const isOwner = isOwnerEmail(actorEmail);
  if (!isOwner) return { settings, isOwner };
  const { rows } = await query<{ id: string; name: string; email: string; role: StaffRole; active: boolean; mode: SelfRedeemMode | null }>(
    `SELECT u.id, u.name, u.email, u.role::text AS role, u.active, o."mode"
       FROM "User" u LEFT JOIN "SelfRedeemOverride" o ON o."userId" = u.id
      ORDER BY u.active DESC, u.role::text ASC, lower(u.name) ASC`,
  );
  const users: SelfRedeemUserRow[] = rows.map((u) => {
    const override = u.mode === 'allow' || u.mode === 'deny' ? u.mode : null;
    const effective = override ? override === 'allow' : settings[u.role] === true;
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      override,
      effective,
      source: override ? 'override' : 'global',
    };
  });
  return { settings, isOwner, users };
}

/** Interruptor global de un rol. Quien llama debe haber pasado authorize(['ADMIN']). No toca las excepciones. */
export async function setGlobal(actorId: string, role: unknown, allowed: unknown): Promise<SelfRedeemSettings> {
  if (!isRole(role)) throw new SelfRedeemError('Rol inválido.');
  if (typeof allowed !== 'boolean') throw new SelfRedeemError('Valor inválido.');
  await withTransaction(async (tx) => {
    const cur = await tx.query<{ allowed: boolean }>(`SELECT "allowed" FROM "SelfRedeemSetting" WHERE "role" = $1 FOR UPDATE`, [role]);
    const previous = cur.rows[0]?.allowed ?? false;
    if (cur.rowCount && previous === allowed) return; // sin cambios: no se escribe ni se audita
    await tx.query(
      `INSERT INTO "SelfRedeemSetting" ("role", "allowed", "updatedAt", "updatedById") VALUES ($1, $2, ${NOW_UTC}, $3)
       ON CONFLICT ("role") DO UPDATE SET "allowed" = EXCLUDED."allowed", "updatedAt" = EXCLUDED."updatedAt", "updatedById" = EXCLUDED."updatedById"`,
      [role, allowed, actorId],
    );
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'selfredeem.global_update', 'Setting', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, `selfRedeem:${role}`, JSON.stringify({ role, previous, value: allowed })],
    );
  });
  return getGlobalSettings();
}

/**
 * Excepción individual. SOLO la cuenta propietaria: se valida aquí con el correo de la sesión que resolvió el servidor
 * (además del chequeo del endpoint). 'inherit' borra la fila (vuelve a depender del interruptor global).
 */
export async function setOverride(
  actor: { id: string; email: string },
  userId: unknown,
  mode: unknown,
): Promise<{ override: SelfRedeemMode | null }> {
  if (!isOwnerEmail(actor.email)) throw new SelfRedeemError('Solo la cuenta propietaria puede cambiar excepciones individuales.', 403);
  const target = String(userId ?? '');
  if (!target) throw new SelfRedeemError('Elige una cuenta.');
  if (mode !== 'allow' && mode !== 'deny' && mode !== 'inherit') throw new SelfRedeemError('Modo inválido.');

  return withTransaction(async (tx) => {
    const u = (await tx.query<{ name: string; email: string; role: string }>(`SELECT name, email, role::text AS role FROM "User" WHERE id = $1 FOR NO KEY UPDATE`, [target])).rows[0];
    if (!u) throw new SelfRedeemError('Esa cuenta no existe.', 404);
    const prev = (await tx.query<{ mode: SelfRedeemMode }>(`SELECT "mode" FROM "SelfRedeemOverride" WHERE "userId" = $1 FOR UPDATE`, [target])).rows[0]?.mode ?? null;
    const next: SelfRedeemMode | null = mode === 'inherit' ? null : mode;
    if (prev === next) return { override: next };
    if (next === null) {
      await tx.query(`DELETE FROM "SelfRedeemOverride" WHERE "userId" = $1`, [target]);
    } else {
      await tx.query(
        `INSERT INTO "SelfRedeemOverride" ("userId", "mode", "updatedAt", "updatedById") VALUES ($1, $2, ${NOW_UTC}, $3)
         ON CONFLICT ("userId") DO UPDATE SET "mode" = EXCLUDED."mode", "updatedAt" = EXCLUDED."updatedAt", "updatedById" = EXCLUDED."updatedById"`,
        [target, next, actor.id],
      );
    }
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'selfredeem.override_set', 'User', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actor.id, target, JSON.stringify({ name: u.name, email: u.email, role: u.role, previous: prev ?? 'inherit', value: next ?? 'inherit' })],
    );
    return { override: next };
  });
}

export const SELF_REDEEM_ROLES = ROLES;

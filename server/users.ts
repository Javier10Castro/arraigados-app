import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { NOW_UTC, newId, query, withTransaction } from './db';
import { BCRYPT_COST, passwordFingerprint, passwordProblem } from './auth';
import type { AdminUserRow, CreateUserRequest, StaffRole, UpdateUserRequest } from '../shared/api';

/**
 * Administración de cuentas Staff/Admin sobre la tabla "User" existente
 * (sin cambios de esquema). Reglas:
 * - Nunca se borra una cuenta (cada canje guarda quién lo hizo): se desactiva.
 * - Nadie puede quitarse el rol de Admin ni desactivarse a sí mismo.
 * - Siempre debe quedar al menos un Admin activo.
 * - Cada cambio queda en AuditLog (entityType "User").
 * - Las contraseñas puestas por Admin son TEMPORALES (ver server/auth.ts).
 */

export class UserError extends Error {}

const ROLES: StaffRole[] = ['ADMIN', 'STAFF'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanName(name: unknown) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 80) throw new UserError('Escribe el nombre (2 a 80 caracteres).');
  return n;
}

async function audit(tx: pg.PoolClient, actorId: string, action: string, userId: string, metadata: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
     VALUES ($1, $2, $3, 'User', $4, $5::jsonb, ${NOW_UTC})`,
    [newId(), actorId, action, userId, JSON.stringify(metadata)],
  );
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    active: boolean;
    createdAt: string;
    passwordHash: string;
    temporary: string | null;
    fp: string | null;
  }>(
    `SELECT u.id, u.name, u.email, u.role::text AS role, u.active,
            to_char(u."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            u."passwordHash", last.temporary, last.fp
       FROM "User" u
       LEFT JOIN LATERAL (
         SELECT metadata->>'temporary' AS temporary, metadata->>'fp' AS fp
           FROM "AuditLog" a
          WHERE a."entityType" = 'User' AND a."entityId" = u.id
            AND a.action IN ('user.create', 'user.password_reset', 'user.password_change')
          ORDER BY a."createdAt" DESC
          LIMIT 1
       ) last ON true
      ORDER BY u.active DESC, u.role ASC, lower(u.name) ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    active: r.active,
    createdAt: r.createdAt,
    pendingPassword: r.temporary === 'true' && r.fp === passwordFingerprint(r.passwordHash),
  }));
}

export async function createUser(actorId: string, input: CreateUserRequest) {
  const name = cleanName(input.name);
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) throw new UserError('Escribe un correo válido.');
  if (!ROLES.includes(input.role)) throw new UserError('Elige un rol.');
  const temp = String(input.temporaryPassword ?? '');
  const problem = passwordProblem(temp);
  if (problem) throw new UserError(problem);

  const passwordHash = await bcrypt.hash(temp, BCRYPT_COST);
  const id = newId();
  try {
    await withTransaction(async (tx) => {
      const exists = await tx.query(`SELECT 1 FROM "User" WHERE lower(email) = $1`, [email]);
      if (exists.rowCount) throw new UserError('Ya existe una cuenta con ese correo.');
      await tx.query(
        `INSERT INTO "User" (id, email, "passwordHash", name, role, active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"UserRole", true, ${NOW_UTC}, ${NOW_UTC})`,
        [id, email, passwordHash, name, input.role],
      );
      await audit(tx, actorId, 'user.create', id, {
        email,
        role: input.role,
        temporary: true,
        fp: passwordFingerprint(passwordHash),
      });
    });
  } catch (err) {
    // Llave única de email (dos altas simultáneas con el mismo correo).
    if ((err as { code?: string })?.code === '23505') throw new UserError('Ya existe una cuenta con ese correo.');
    throw err;
  }
  return id;
}

export async function updateUser(actorId: string, userId: string, input: UpdateUserRequest) {
  await withTransaction(async (tx) => {
    // Bloquea a los admins activos para que dos cambios simultáneos no dejen la app sin Admin.
    await tx.query(`SELECT id FROM "User" WHERE role = 'ADMIN' AND active = true FOR UPDATE`);
    const { rows } = await tx.query<{ name: string; role: StaffRole; active: boolean }>(
      `SELECT name, role::text AS role, active FROM "User" WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const before = rows[0];
    if (!before) throw new UserError('Esa cuenta no existe.');

    const after = {
      name: input.name !== undefined ? cleanName(input.name) : before.name,
      role: input.role !== undefined ? input.role : before.role,
      active: input.active !== undefined ? Boolean(input.active) : before.active,
    };
    if (!ROLES.includes(after.role)) throw new UserError('Elige un rol.');

    if (userId === actorId) {
      if (after.role !== 'ADMIN') throw new UserError('No puedes quitarte el rol de Admin a ti mismo.');
      if (!after.active) throw new UserError('No puedes desactivar tu propia cuenta.');
    }
    const losesAdmin = before.role === 'ADMIN' && before.active && (after.role !== 'ADMIN' || !after.active);
    if (losesAdmin) {
      const { rows: admins } = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "User" WHERE role = 'ADMIN' AND active = true AND id <> $1`,
        [userId],
      );
      if (admins[0].n === 0) throw new UserError('Debe quedar al menos un Admin activo.');
    }

    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => after[k] !== before[k]);
    if (changed.length === 0) return;
    await tx.query(
      `UPDATE "User" SET name = $2, role = $3::"UserRole", active = $4, "updatedAt" = ${NOW_UTC} WHERE id = $1`,
      [userId, after.name, after.role, after.active],
    );
    await audit(tx, actorId, 'user.update', userId, {
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    });
  });
}

/** Admin pone una nueva contraseña TEMPORAL (cierra las sesiones abiertas de esa cuenta). */
export async function resetPassword(actorId: string, userId: string, temporaryPassword: string) {
  if (userId === actorId) throw new UserError('Para tu propia cuenta usa "Cambiar mi contraseña".');
  const problem = passwordProblem(String(temporaryPassword ?? ''));
  if (problem) throw new UserError(problem);
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
  await withTransaction(async (tx) => {
    const res = await tx.query(`UPDATE "User" SET "passwordHash" = $2, "updatedAt" = ${NOW_UTC} WHERE id = $1`, [
      userId,
      passwordHash,
    ]);
    if (res.rowCount === 0) throw new UserError('Esa cuenta no existe.');
    await audit(tx, actorId, 'user.password_reset', userId, { temporary: true, fp: passwordFingerprint(passwordHash) });
  });
}

/** El propio usuario cambia su contraseña (obligatorio si la actual es temporal). */
export async function changeOwnPassword(userId: string, currentHash: string, currentPassword: string, newPassword: string) {
  if (!(await bcrypt.compare(String(currentPassword ?? ''), currentHash))) {
    throw new UserError('La contraseña actual no es correcta.');
  }
  const problem = passwordProblem(String(newPassword ?? ''));
  if (problem) throw new UserError(problem);
  if (newPassword === currentPassword) throw new UserError('La nueva contraseña debe ser distinta a la actual.');
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await withTransaction(async (tx) => {
    await tx.query(`UPDATE "User" SET "passwordHash" = $2, "updatedAt" = ${NOW_UTC} WHERE id = $1`, [
      userId,
      passwordHash,
    ]);
    await audit(tx, userId, 'user.password_change', userId, { temporary: false });
  });
  return passwordHash;
}

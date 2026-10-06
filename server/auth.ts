import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db';
import { apiError } from './http';
import type { StaffRole, StaffUser } from '../shared/api';

/**
 * Sesión de Staff/Admin. Usa las MISMAS cuentas de la tabla "User" del
 * Next.js (mismo correo, misma contraseña cifrada con bcrypt). No hay un
 * sistema paralelo de usuarios.
 *
 * - La sesión es una cookie httpOnly firmada (HMAC-SHA256 con SESSION_SECRET).
 * - Cada petición protegida revalida en Neon: cuenta activa, rol permitido y
 *   que la contraseña no haya cambiado desde que se abrió la sesión (la
 *   cookie lleva una huella de la contraseña cifrada). Cambiar o restablecer
 *   la contraseña cierra las demás sesiones abiertas de esa cuenta.
 *
 * Contraseña temporal (sin cambios de esquema): cuando Admin crea una cuenta
 * o restablece su contraseña, se registra en AuditLog ("user.create" /
 * "user.password_reset") con metadata { temporary: true, fp } donde fp es la
 * huella de esa contraseña cifrada. Mientras el último evento de contraseña
 * sea temporal y la huella coincida, la cuenta DEBE cambiar su contraseña
 * antes de usar cualquier otra función.
 */

const COOKIE = 'arr_staff';
const SESSION_HOURS = 12; // un día de congreso
export const BCRYPT_COST = 12; // igual que prisma/seed.ts del Next.js

type Payload = { uid: string; exp: number; ph: string };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('Falta SESSION_SECRET en el archivo .env de arraigados-app (ver .env.example).');
  }
  return s;
}

/** Huella (no reversible) de una contraseña YA cifrada. Nunca se guarda la contraseña. */
export function passwordFingerprint(passwordHash: string) {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 24);
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(payload: Payload) {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = b64url(createHmac('sha256', secret()).update(body).digest());
  return `${body}.${mac}`;
}

function verify(token: string): Payload | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret()).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number' || typeof payload.ph !== 'string') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string) {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** En localhost (http) el navegador no guarda cookies "Secure"; en producción (https) sí se exige. */
function secureFlag(req: Request) {
  return new URL(req.url).protocol === 'https:' ? '; Secure' : '';
}

export function sessionCookie(req: Request, uid: string, passwordHash: string) {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const token = sign({ uid, exp, ph: passwordFingerprint(passwordHash) });
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secureFlag(req)}`;
}

export function clearCookie(req: Request) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`;
}

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  active: boolean;
  passwordHash: string;
  tempTemporary: string | null;
  tempFp: string | null;
};

/**
 * Trae el usuario Y, en la MISMA consulta (LEFT JOIN LATERAL), el último
 * evento de contraseña relevante (para saber si es temporal). Antes eran 2
 * round trips separados (uno por "User", otro por "AuditLog") en CADA
 * request autenticado de Staff/Admin; esta es la razón de combinarlos:
 * reduce a la mitad las consultas de sesión sin quitar ningún chequeo de
 * seguridad (mismas condiciones, mismo resultado).
 */
const USER_WITH_PASSWORD_FLAG_SELECT = `
  SELECT u.id, u.email, u.name, u.role::text AS role, u.active, u."passwordHash",
         al.metadata->>'temporary' AS "tempTemporary", al.metadata->>'fp' AS "tempFp"
    FROM "User" u
    LEFT JOIN LATERAL (
      SELECT metadata
        FROM "AuditLog"
       WHERE "entityType" = 'User' AND "entityId" = u.id
         AND action IN ('user.create', 'user.password_reset', 'user.password_change')
       ORDER BY "createdAt" DESC
       LIMIT 1
    ) al ON true`;

async function findUserWithPasswordFlag(whereSql: string, param: string, limit?: number): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(
    `${USER_WITH_PASSWORD_FLAG_SELECT} WHERE ${whereSql}${limit ? ` LIMIT ${limit}` : ''}`,
    [param],
  );
  return rows;
}

/** ¿La contraseña actual de la cuenta es una temporal puesta por Admin? (a partir de la fila ya traída). */
function isTemporaryFromRow(row: Pick<UserRow, 'tempTemporary' | 'tempFp' | 'passwordHash'>): boolean {
  return Boolean(row.tempTemporary === 'true' && row.tempFp === passwordFingerprint(row.passwordHash));
}

/**
 * Igual que el authorize() del Next.js: cuenta existente, activa y contraseña
 * correcta. Devuelve también la contraseña cifrada (para la cookie) y si es temporal.
 */
export async function checkCredentials(
  email: string,
  password: string,
): Promise<{ user: StaffUser; passwordHash: string } | null> {
  const clean = email.trim();
  if (!clean || !password) return null;
  // El Next.js busca el correo exacto; aquí también se tolera mayúsculas/espacios al escribirlo.
  // lower(email) puede devolver 2 filas en casos raros de mayúsculas duplicadas; limit 2 + el
  // find de abajo desempata por el correo EXACTO, igual que antes.
  const rows = await findUserWithPasswordFlag('lower(u.email) = lower($1)', clean, 2);
  const row = rows.length === 1 ? rows[0] : rows.find((r) => r.email === clean);
  if (!row || !row.active) {
    // Compara contra un hash falso para que no se note por el tiempo si el correo existe.
    await bcrypt.compare(password, '$2b$10$hDxGbUeUcN1YzaoQDYTpVeTdrUqARyEZD.BV6qRr4mbzTqNXereg2');
    return null;
  }
  if (!(await bcrypt.compare(password, row.passwordHash))) return null;
  return {
    user: { id: row.id, name: row.name, email: row.email, role: row.role, mustChangePassword: isTemporaryFromRow(row) },
    passwordHash: row.passwordHash,
  };
}

/**
 * Usuario de la sesión, revalidado en Neon, o null si no hay sesión válida
 * (sin cookie, firma inválida, vencida, cuenta inactiva o contraseña cambiada
 * desde que se abrió la sesión).
 */
export async function currentStaff(req: Request): Promise<(StaffUser & { passwordHash: string }) | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;
  const row = (await findUserWithPasswordFlag('u.id = $1', payload.uid))[0];
  if (!row || !row.active) return null;
  if (passwordFingerprint(row.passwordHash) !== payload.ph) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    mustChangePassword: isTemporaryFromRow(row),
    passwordHash: row.passwordHash,
  };
}

/**
 * Para las funciones protegidas: devuelve el usuario, o la respuesta de error
 * lista para regresar (401 sin sesión; 403 sin permiso o si debe cambiar su
 * contraseña). `allowPending` solo lo usan /api/auth/me y /api/auth/password.
 */
export async function authorize(
  req: Request,
  allowed: StaffRole[] = ['ADMIN', 'STAFF'],
  { allowPending = false } = {},
): Promise<{ user: StaffUser & { passwordHash: string } } | { response: Response }> {
  const user = await currentStaff(req);
  if (!user) return { response: apiError('Inicia sesión.', 401) };
  if (!allowed.includes(user.role)) return { response: apiError('No tienes permiso para esta sección.', 403) };
  if (user.mustChangePassword && !allowPending) {
    return { response: apiError('Primero crea tu contraseña personal.', 403, { mustChangePassword: true }) };
  }
  return { user };
}

/** Reglas de contraseña (bcrypt solo usa los primeros 72 bytes). */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'La contraseña es demasiado larga (máximo 72 bytes; las letras con acento y los emojis ocupan más de uno).';
  return null;
}

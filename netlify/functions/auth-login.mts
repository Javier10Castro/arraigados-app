import { isOwnerEmail } from '../../server/owner';
import type { Config, Context } from '@netlify/functions';
import { checkCredentials, sessionCookie } from '../../server/auth';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guard, ipScope, normalizeIdentity, refund, scope } from '../../server/rateLimit';
import type { LoginRequest } from '../../shared/api';

/**
 * POST /api/auth/login -- Staff/Admin con su cuenta de "User" (la misma del Next.js).
 *
 * Límite de intentos (server/rateLimit.ts), ANTES de verificar la contraseña (bcrypt es caro y es lo que se quiere frenar):
 *   login_pair  correo + IP        5 / 15 min
 *   login_ip    IP (todas las cuentas) 40 / 15 min
 *   login_id    correo (todas las IP)  20 / 15 min
 * Se gasta 1 de cada una ANTES de comprobar (así 100 peticiones en paralelo no pasan de 5) y se DEVUELVE si el inicio de sesión
 * es correcto. El correo se normaliza y el límite aplica igual exista o no la cuenta; la respuesta 429 es la misma en ambos
 * casos (no revela cuentas). Se recupera sola al terminar la ventana (no hay bloqueo permanente ni escalado). Si falla el
 * almacén de contadores: 503 (login es regla "closed"), salvo tabla inexistente (migración 011 pendiente) que deja pasar.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  let body: LoginRequest;
  try {
    body = (await req.json()) as LoginRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  const identity = normalizeIdentity(body?.email);
  const ip = ipScope(context);
  const hits = [
    { rule: RULES.login_pair, id: scope('pair', identity, ip) },
    { rule: RULES.login_ip, id: ip },
    { rule: RULES.login_id, id: scope('id', identity) },
  ];
  const blocked = await guard(hits);
  if (blocked) return blocked;
  const result = await checkCredentials(String(body.email ?? ''), String(body.password ?? ''));
  if (!result) return apiError('Correo o contraseña incorrectos, o la cuenta está desactivada.', 401);
  await refund(hits);
  // Si la contraseña es temporal, la sesión solo sirve para crear la definitiva (ver authorize()).
  return json({ ...result.user, isOwner: isOwnerEmail(result.user.email) }, 200, { 'set-cookie': sessionCookie(req, result.user.id, result.passwordHash) });
});

export const config: Config = { path: '/api/auth/login' };

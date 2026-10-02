import type { Config } from '@netlify/functions';
import { checkCredentials, sessionCookie } from '../../server/auth';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { LoginRequest } from '../../shared/api';

/** POST /api/auth/login -- Staff/Admin con su cuenta de "User" (la misma del Next.js). */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  let body: LoginRequest;
  try {
    body = (await req.json()) as LoginRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  const result = await checkCredentials(String(body.email ?? ''), String(body.password ?? ''));
  if (!result) return apiError('Correo o contraseña incorrectos, o la cuenta está desactivada.', 401);
  // Si la contraseña es temporal, la sesión solo sirve para crear la definitiva (ver authorize()).
  return json(result.user, 200, { 'set-cookie': sessionCookie(req, result.user.id, result.passwordHash) });
});

export const config: Config = { path: '/api/auth/login' };

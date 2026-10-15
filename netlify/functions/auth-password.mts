import type { Config } from '@netlify/functions';
import { authorize, sessionCookie } from '../../server/auth';
import { isOwnerEmail } from '../../server/owner';
import { UserError, WRONG_CURRENT_PASSWORD, changeOwnPassword } from '../../server/users';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guardUser, refund, scope } from '../../server/rateLimit';
import type { ChangePasswordRequest } from '../../shared/api';

/**
 * POST /api/auth/password -- el usuario de la sesión cambia su contraseña.
 * Es lo único que puede hacer una cuenta con contraseña temporal. Al cambiarla,
 * la temporal deja de valer y se emite una sesión nueva (las demás se cierran).
 */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN', 'STAFF'], { allowPending: true });
  if ('response' in auth) return auth.response;
  let body: ChangePasswordRequest;
  try {
    body = (await req.json()) as ChangePasswordRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  // Adivinar la contraseña actual desde una sesión robada: 5 intentos / 15 min por cuenta (se devuelve si sale bien).
  const pwdHit = { rule: RULES.pwd_user, id: scope(auth.user.id) };
  const blocked = await guardUser(RULES.pwd_user, auth.user.id);
  if (blocked) return blocked;
  try {
    const newHash = await changeOwnPassword(auth.user.id, auth.user.passwordHash, body.currentPassword, body.newPassword);
    await refund([pwdHit]);
    const { passwordHash: _omit, ...user } = auth.user;
    return json({ ...user, mustChangePassword: false, isOwner: isOwnerEmail(user.email) }, 200, { 'set-cookie': sessionCookie(req, user.id, newHash) });
  } catch (err) {
    if (err instanceof UserError) {
      // Solo adivinar la contraseña ACTUAL gasta intentos; un error al escribir la nueva (muy corta, igual a la actual) se devuelve.
      if (err.message !== WRONG_CURRENT_PASSWORD) await refund([pwdHit]);
      return apiError(err.message, 400);
    }
    throw err;
  }
});

export const config: Config = { path: '/api/auth/password' };

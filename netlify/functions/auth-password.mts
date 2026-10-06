import type { Config } from '@netlify/functions';
import { authorize, sessionCookie } from '../../server/auth';
import { isOwnerEmail } from '../../server/owner';
import { UserError, changeOwnPassword } from '../../server/users';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
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
  try {
    const newHash = await changeOwnPassword(auth.user.id, auth.user.passwordHash, body.currentPassword, body.newPassword);
    const { passwordHash: _omit, ...user } = auth.user;
    return json({ ...user, mustChangePassword: false, isOwner: isOwnerEmail(user.email) }, 200, { 'set-cookie': sessionCookie(req, user.id, newHash) });
  } catch (err) {
    if (err instanceof UserError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/auth/password' };

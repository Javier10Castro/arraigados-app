import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { UserError, deleteUser, resetPassword, updateUser } from '../../server/users';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { ResetPasswordRequest, UpdateUserRequest } from '../../shared/api';

/**
 * PATCH /api/admin/users/:id            -> nombre, rol, activa/desactivada
 * POST  /api/admin/users/:id/password   -> nueva contraseña TEMPORAL
 * DELETE /api/admin/users/:id          -> elimina la cuenta (nunca la dueña, ni la propia, ni al último Admin)
 * Solo Admin.
 */
export default handler(async (req: Request, context: Context) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  const id = context.params.id ?? '';
  const isPassword = new URL(req.url).pathname.endsWith('/password');
  if (req.method === 'DELETE' && !isPassword) {
    try {
      await deleteUser(auth.user.id, id);
      return json({ ok: true });
    } catch (err) {
      if (err instanceof UserError) return apiError(err.message, 400);
      throw err;
    }
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    if (isPassword) {
      if (req.method !== 'POST') return methodNotAllowed('POST');
      await resetPassword(auth.user.id, id, (body as ResetPasswordRequest).temporaryPassword);
    } else {
      if (req.method !== 'PATCH') return methodNotAllowed('PATCH');
      await updateUser(auth.user.id, id, body as UpdateUserRequest);
    }
    return json({ ok: true });
  } catch (err) {
    if (err instanceof UserError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: ['/api/admin/users/:id', '/api/admin/users/:id/password'] };

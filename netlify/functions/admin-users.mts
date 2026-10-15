import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { UserError, createUser, listUsers } from '../../server/users';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guardUser } from '../../server/rateLimit';
import type { CreateUserRequest } from '../../shared/api';

/** GET /api/admin/users (lista) · POST /api/admin/users (crear con contraseña temporal). Solo Admin. */
export default handler(async (req: Request) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (req.method === 'GET') return json(await listUsers());
  if (req.method !== 'POST') return methodNotAllowed('GET, POST');
  const blocked = await guardUser(RULES.admin_user_w, auth.user.id); // crear cuenta con contraseña temporal
  if (blocked) return blocked;
  let body: CreateUserRequest;
  try {
    body = (await req.json()) as CreateUserRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    const id = await createUser(auth.user.id, body);
    return json({ id }, 201);
  } catch (err) {
    if (err instanceof UserError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/users' };

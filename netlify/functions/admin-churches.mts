import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { ChurchError, createChurch, listChurchesAdmin } from '../../server/churches';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { ChurchInput } from '../../shared/api';

/**
 * GET  /api/admin/churches                      -> iglesias + presbiterios (solo lectura) para elegir
 * POST /api/admin/churches { name, presbyteryId } -> agrega una iglesia
 * Solo ADMIN. Presbiterios y zonas no se pueden crear ni editar desde aquí.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') return json(await listChurchesAdmin());

  let body: Partial<ChurchInput>;
  try {
    body = (await req.json()) as Partial<ChurchInput>;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await createChurch(auth.user.id, body), 201);
  } catch (err) {
    if (err instanceof ChurchError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/churches' };

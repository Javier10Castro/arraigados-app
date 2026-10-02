import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { RedemptionVoidError, voidRedemption } from '../../server/redemptions';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { VoidRedemptionRequest } from '../../shared/api';

/**
 * POST /api/admin/redemptions/:id/void -- anula un canje (nunca lo borra).
 *
 * Solo ADMIN: `authorize(req, ['ADMIN'])` revalida la sesión y el rol EN EL
 * SERVIDOR (igual que el resto de Admin) -- un Staff que llame este endpoint
 * directamente recibe 403, sin importar qué mande en el cuerpo. El actor de
 * la anulación es SIEMPRE `auth.user.id` (de la cookie de sesión firmada),
 * nunca un id que venga en la petición.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Ese canje no existe.', 404);

  let body: VoidRedemptionRequest;
  try {
    body = (await req.json()) as VoidRedemptionRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }

  try {
    const result = await voidRedemption(id, auth.user.id, String(body.reason ?? ''));
    if (result.outcome === 'not_found') return apiError('Ese canje no existe.', 404);
    return json(result);
  } catch (err) {
    if (err instanceof RedemptionVoidError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/redemptions/:id/void' };

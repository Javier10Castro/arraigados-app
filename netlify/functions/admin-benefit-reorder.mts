import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { BenefitError, moveBenefit } from '../../server/benefits';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * POST /api/admin/benefits/:id/reorder { dir: -1 | 1 } -> sube/baja un beneficio un lugar dentro de su kit.
 * Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Ese beneficio no existe.', 404);
  let body: { dir?: number };
  try {
    body = (await req.json()) as { dir?: number };
  } catch {
    return apiError('Solicitud inválida.');
  }
  const dir = body.dir === -1 || body.dir === 1 ? body.dir : null;
  if (dir === null) return apiError('Dirección inválida.');
  try {
    await moveBenefit(auth.user.id, id, dir);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof BenefitError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/benefits/:id/reorder' };

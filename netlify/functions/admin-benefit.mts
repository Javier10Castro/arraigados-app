import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { BenefitError, deleteBenefit, updateBenefit } from '../../server/benefits';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * PATCH  /api/admin/benefits/:id { label } -> cambia el texto de un beneficio
 * DELETE /api/admin/benefits/:id           -> lo quita del kit
 * Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return methodNotAllowed('PATCH, DELETE');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const id = context.params.id ?? '';
  if (!id) return apiError('Ese beneficio no existe.', 404);
  try {
    if (req.method === 'DELETE') {
      await deleteBenefit(auth.user.id, id);
      return json({ ok: true });
    }
    let body: { label?: unknown };
    try {
      body = (await req.json()) as { label?: unknown };
    } catch {
      return apiError('Solicitud inválida.');
    }
    await updateBenefit(auth.user.id, id, body.label);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof BenefitError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/benefits/:id' };

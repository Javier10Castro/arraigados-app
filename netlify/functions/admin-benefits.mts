import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { BenefitError, createBenefit, listBenefitsAdmin } from '../../server/benefits';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET  /api/admin/benefits                       -> kits con sus beneficios (lo que incluye cada kit)
 * POST /api/admin/benefits { packageId, label }  -> agrega un beneficio al final de la lista del kit
 * Solo ADMIN.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') return json(await listBenefitsAdmin());

  let body: { packageId?: unknown; label?: unknown };
  try {
    body = (await req.json()) as { packageId?: unknown; label?: unknown };
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await createBenefit(auth.user.id, body.packageId, body.label), 201);
  } catch (err) {
    if (err instanceof BenefitError) return apiError(err.message, err.status);
    if ((err as { code?: string })?.code === '42P01') return apiError('Falta aplicar la migración 008 (npm run db:migrar).', 409);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/benefits' };

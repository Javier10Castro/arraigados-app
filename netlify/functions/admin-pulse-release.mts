import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { isOwnerEmail } from '../../server/owner';
import { PulseReleaseError, releasePulse } from '../../server/pulseRelease';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * POST /api/admin/pulses/:id/release -> desvincula la pulsera y la deja recién creada (herramienta de pruebas).
 * Solo la cuenta dueña (403 al resto). No se registra en la bitácora.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!isOwnerEmail(auth.user.email)) return apiError('No tienes permiso para esta acción.', 403);
  const id = context.params.id ?? '';
  if (!id) return apiError('Esa pulsera no existe.', 404);
  try {
    return json(await releasePulse(id));
  } catch (err) {
    if (err instanceof PulseReleaseError) return apiError(err.message, 400);
    // Herramienta solo para la cuenta dueña: se muestra el detalle real para poder diagnosticar.
    console.error('[api] release', err);
    return apiError(`No se pudo desvincular: ${err instanceof Error ? err.message : 'error desconocido'}`, 500);
  }
});

export const config: Config = { path: '/api/admin/pulses/:id/release' };

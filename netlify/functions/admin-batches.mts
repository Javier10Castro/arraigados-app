import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { BatchError, createBatch, listBatches, listPackagesForBatch, suggestBatchCode } from '../../server/batches';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { MAX_BATCH_PULSES, MIN_BATCH_PULSES, type CreateBatchRequest } from '../../shared/api';

/**
 * GET  /api/admin/batches            -> lotes con sus conteos
 * GET  /api/admin/batches/next-code  -> nombre sugerido (LOTE-YYYY-NNN)
 * POST /api/admin/batches            -> crear lote + 1..500 pulseras
 * Solo ADMIN. Sin cambios en el esquema de autorizacion: es el mismo
 * authorize(req, ['ADMIN']) que usan admin-users.mts / admin-user.mts.
 */
export default handler(async (req: Request) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const path = new URL(req.url).pathname;

  if (req.method === 'GET' && path.endsWith('/next-code')) {
    return json({ code: await suggestBatchCode(), min: MIN_BATCH_PULSES, max: MAX_BATCH_PULSES });
  }

  if (req.method === 'GET') {
    // Los paquetes vienen en la misma respuesta: el formulario de alta los
    // necesita y asi no duplicamos un endpoint que ya expone /api/packages.
    // Ojo: la columna real de precio en Neon es `price`, no `priceCents`.
    const [batches, packages] = await Promise.all([listBatches(), listPackagesForBatch()]);
    return json({ batches, packages });
  }

  if (req.method !== 'POST') return methodNotAllowed('GET, POST');

  let body: CreateBatchRequest;
  try {
    body = (await req.json()) as CreateBatchRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    const created = await createBatch(auth.user.id, body);
    return json(created, 201);
  } catch (err) {
    if (err instanceof BatchError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: ['/api/admin/batches', '/api/admin/batches/next-code'] };

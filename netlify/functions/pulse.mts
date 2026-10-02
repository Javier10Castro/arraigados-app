import type { Config, Context } from '@netlify/functions';
import { getPulseStatus } from '../../server/attendee';
import { handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET /api/pulse/:token -- estado de una pulsera escaneada:
 * not_found | invalidated | active | unclaimed (+ paquete).
 * Solo acepta el qrToken del QR; el código manual AR26-XXXXX es exclusivo de Staff.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  return json(await getPulseStatus(context.params.token ?? ''));
});

export const config: Config = { path: '/api/pulse/:token' };

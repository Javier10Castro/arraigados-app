import type { Config, Context } from '@netlify/functions';
import { getPulseStatus } from '../../server/attendee';
import { handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guard, ipScope, record } from '../../server/rateLimit';

/**
 * GET /api/pulse/:token -- estado de una pulsera escaneada:
 * not_found | invalidated | active | unclaimed (+ paquete).
 * Solo acepta el qrToken del QR; el código manual AR26-XXXXX es exclusivo de Staff.
 * Límite: solo cuenta las pulseras INEXISTENTES por IP (tok_miss_ip); escanear una pulsera válida no gasta nada.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const ip = ipScope(context);
  const blocked = await guard([{ rule: RULES.tok_miss_ip, id: ip, inc: 0 }]);
  if (blocked) return blocked;
  const status = await getPulseStatus(context.params.token ?? '');
  if (status.status === 'not_found') await record([{ rule: RULES.tok_miss_ip, id: ip }]);
  return json(status);
});

export const config: Config = { path: '/api/pulse/:token' };

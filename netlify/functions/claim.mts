import type { Config } from '@netlify/functions';
import { ValidationError, claimPulse } from '../../server/attendee';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { ClaimRequest } from '../../shared/api';

/** POST /api/claim -- registra al asistente y reclama la pulsera (atómico). */
export default handler(async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  let body: ClaimRequest;
  try {
    body = (await req.json()) as ClaimRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await claimPulse(body));
  } catch (err) {
    if (err instanceof ValidationError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/claim' };

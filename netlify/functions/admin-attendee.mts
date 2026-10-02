import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { AttendeeError, getAttendee, updateAttendee } from '../../server/attendees';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { UpdateAttendeeRequest } from '../../shared/api';

/**
 * GET   /api/admin/attendees/:id -> detalle (datos, pulseras, canjes)
 * PATCH /api/admin/attendees/:id -> corregir nombre, rango de edad e iglesia
 * Solo ADMIN.
 */
export default handler(async (req: Request, context: Context) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  const id = context.params.id ?? '';
  // Sin id = 404 (ver admin-batch.mts: netlify dev reintenta los 404 como estáticos).
  if (!id) return apiError('Ese asistente no existe.', 404);

  if (req.method === 'GET') {
    const found = await getAttendee(id);
    return found ? json(found) : apiError('Ese asistente no existe.', 404);
  }
  if (req.method === 'PATCH') {
    let body: UpdateAttendeeRequest;
    try {
      body = (await req.json()) as UpdateAttendeeRequest;
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      return json(await updateAttendee(id, body, auth.user.id));
    } catch (err) {
      if (err instanceof AttendeeError) return apiError(err.message, 400);
      throw err;
    }
  }
  return methodNotAllowed('GET, PATCH');
});

export const config: Config = { path: '/api/admin/attendees/:id' };

import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { ProfileError, removePhotoAsAdmin } from '../../server/profile';

/**
 * DELETE /api/admin/attendees/:id/profile-photo -> moderación: quita la foto de perfil de un asistente
 * (queda con sus iniciales y se borra el archivo). Solo ADMIN. Deja registro en la bitácora.
 */
export default handler(async (req: Request, context: Context) => {
  if (req.method !== 'DELETE') return methodNotAllowed('DELETE');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  const id = context.params.id ?? '';
  if (!id) return apiError('Ese asistente no existe.', 404);
  try {
    await removePhotoAsAdmin(auth.user.id, id);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof ProfileError) return apiError(err.message, err.status);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/attendees/:id/profile-photo' };

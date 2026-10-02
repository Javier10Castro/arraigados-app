import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { SettingsError, getSettings, setAvatarMode } from '../../server/settings';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import type { UpdateSettingsRequest } from '../../shared/api';

/**
 * GET   /api/admin/settings -- igual que /api/settings (para el panel).
 * PATCH /api/admin/settings -- cambia la configuración global. SOLO ADMIN:
 * el rol se revalida aquí (STAFF recibe 403 aunque llame la API a mano).
 * Cada cambio queda en AuditLog (action "setting.update").
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed('GET, PATCH');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') return json(await getSettings());

  let body: UpdateSettingsRequest;
  try {
    body = (await req.json()) as UpdateSettingsRequest;
  } catch {
    return apiError('Solicitud inválida.');
  }
  if (!body || body.avatarMode === undefined) return apiError('Nada que cambiar.');
  try {
    return json(await setAvatarMode(auth.user.id, body.avatarMode));
  } catch (err) {
    if (err instanceof SettingsError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/settings' };

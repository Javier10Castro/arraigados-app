import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { isOwnerEmail } from '../../server/owner';
import { RULES, guardUser } from '../../server/rateLimit';
import { SECRETO_KITS, isSecretoKit, listKitLines } from '../../server/secreto';
import { apiError, handler, methodNotAllowed } from '../../server/http';

/**
 * GET /api/admin/secreto?kit=a|b|especial -> .txt con "Nombre - Iglesia" (una línea por asistente con pulsera activa del kit).
 * Solo ADMIN y SOLO la cuenta propietaria (se revalida aquí; la pantalla oculta el botón pero no es la defensa). Solo lectura.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (!isOwnerEmail(auth.user.email)) return apiError('No tienes acceso a esta sección.', 403);
  const blocked = await guardUser(RULES.admin_heavy, auth.user.id);
  if (blocked) return blocked;

  const kit = new URL(req.url).searchParams.get('kit');
  if (!isSecretoKit(kit)) return apiError('Kit inválido. Usa a, b o especial.', 400);

  const lines = await listKitLines(kit);
  if (lines.length === 0) return apiError(`No hay asistentes con pulsera activa en ${SECRETO_KITS[kit].label}.`, 404);

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="lista-${kit}-${stamp}.txt"`,
      'cache-control': 'no-store',
    },
  });
});

export const config: Config = { path: '/api/admin/secreto' };

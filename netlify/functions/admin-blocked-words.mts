import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { BLOCKED_WORD_MAX, BlockedWordError, addBlockedWord, listBlockedWords } from '../../server/blockedWords';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';

/**
 * GET  /api/admin/blocked-words          -> palabras que bloqueó el Admin
 * POST /api/admin/blocked-words { word } -> agrega una (o frase)
 * Solo ADMIN. Se SUMAN a la lista fija de shared/moderation.ts.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  if (req.method === 'GET') return json({ words: await listBlockedWords(), max: BLOCKED_WORD_MAX });

  let body: { word?: unknown };
  try {
    body = (await req.json()) as { word?: unknown };
  } catch {
    return apiError('Solicitud inválida.');
  }
  try {
    return json(await addBlockedWord(auth.user.id, body.word));
  } catch (err) {
    if (err instanceof BlockedWordError) return apiError(err.message, 400);
    throw err;
  }
});

export const config: Config = { path: '/api/admin/blocked-words' };

import type { Config } from '@netlify/functions';
import { NoteValidationError, createNote, listMyNotes, removeMyActiveNote } from '../../server/notes';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PULSE_TOKEN_HEADER, type CreateNoteRequest } from '../../shared/api';

/**
 * GET  /api/notes -- "Mis notas" del dueño de la pulsera (activas y
 *                    expiradas; el feed "comunidad" de /home usa datos de
 *                    prueba en el frontend, no este endpoint).
 * POST /api/notes -- crea una nota (siempre PRIVATE, máximo 60 caracteres,
 *                    vigente 24h). Identidad resuelta por x-pulse-token,
 *                    igual que /api/me -- nunca por un id del cliente. Reemplaza
 *                    (hace expirar) la nota activa anterior.
 * DELETE /api/notes -- "Quitar nota": hace expirar ya la nota activa (la fila
 *                    queda como historial). Responde { removed }.
 */
export default handler(async (req: Request) => {
  const token = req.headers.get(PULSE_TOKEN_HEADER) ?? '';

  if (req.method === 'GET') {
    const result = await listMyNotes(token);
    if (!result.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: result.status });
    return json({ notes: result.notes });
  }

  if (req.method === 'POST') {
    let body: CreateNoteRequest;
    try {
      body = (await req.json()) as CreateNoteRequest;
    } catch {
      return apiError('Solicitud inválida.');
    }
    try {
      const result = await createNote(token, body.text);
      if (!result.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: result.status });
      return json({ note: result.note });
    } catch (err) {
      if (err instanceof NoteValidationError) return apiError(err.message, err.code === 'blocked_language' ? 422 : 400, { code: err.code });
      throw err;
    }
  }

  if (req.method === 'DELETE') {
    const result = await removeMyActiveNote(token);
    if (!result.ok) return apiError('Esta pulsera no tiene una sesión activa.', 401, { status: result.status });
    return json({ removed: result.removed });
  }

  return methodNotAllowed('GET, POST, DELETE');
});

export const config: Config = { path: '/api/notes' };

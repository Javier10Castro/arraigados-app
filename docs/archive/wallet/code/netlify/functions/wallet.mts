import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { RULES, guard, guardUser, scope, withAttendeeLimit } from '../../server/rateLimit';
import { PULSE_TOKEN_HEADER } from '../../shared/api';
import { loadWalletConfig, walletAvailability, walletDiagnostics, type WalletConfig } from '../../server/wallet/config';
import { makeTicket, verifyTicket } from '../../server/wallet/code';
import { PKPASS_MIME, buildPkpass } from '../../server/wallet/apple';
import { buildGoogleSaveUrl } from '../../server/wallet/google';
import { subjectForAttendeeToken, subjectForPulseId, subjectForTeamUser, type SubjectResult } from '../../server/wallet/subject';
import type { WalletSubject } from '../../server/wallet/event';

/**
 * Credencial digital (Apple Wallet / Google Wallet). Rutas:
 *   GET  /api/wallet/status        -> { apple, google } (solo si cada plataforma está configurada; sin detalles)
 *   GET  /api/wallet/diagnostics   -> SOLO ADMIN: qué variables faltan (nombres, nunca valores) para activar Wallet
 *   POST /api/wallet/apple-ticket  -> { url } boleto de descarga de ~90 s para abrir el .pkpass desde el navegador
 *   GET  /api/wallet/apple?t=…     -> el .pkpass (application/vnd.apple.pkpass); el boleto es la credencial de esta ruta
 *   POST /api/wallet/google        -> { url } enlace «Add to Google Wallet» firmado
 * Identidad: SIEMPRE de la sesión verificada (token de pulsera del asistente en x-pulse-token, o cookie del equipo).
 * Ninguna ruta acepta un id de pulsera/asistente/cuenta del cliente: nadie puede pedir la credencial de otra persona.
 * Detalle de seguridad y configuración: docs/WALLET.md.
 */

const UNAVAILABLE = 'Esta opción todavía no está disponible. Avisa al equipo del congreso.';
const wallet = (message: string, status: number, code: string, extra: { status?: 'not_found' | 'invalidated' | 'unclaimed' } = {}) =>
  apiError(message, status, { code, ...extra });

function failure(r: Extract<SubjectResult, { ok: false }>, team: boolean): Response {
  if (r.reason === 'no_pulse') return wallet('Tu cuenta no tiene una pulsera vinculada. Vincúlala primero (Más → Vincular pulsera).', 404, 'no_pulse');
  if (r.reason === 'invalidated') return wallet('Esta pulsera fue deshabilitada: ya no se puede crear su credencial.', team ? 409 : 401, 'invalidated', { status: 'invalidated' });
  return wallet('Esta pulsera no tiene una sesión activa.', 401, 'no_session', { status: r.reason === 'unclaimed' ? 'unclaimed' : 'not_found' });
}

/** Resuelve quién pide la credencial (asistente por token o equipo por cookie) aplicando el límite de frecuencia. */
async function withSubject(req: Request, context: Context, run: (subject: WalletSubject) => Promise<Response>): Promise<Response> {
  const token = (req.headers.get(PULSE_TOKEN_HEADER) ?? '').trim();
  if (token) {
    return withAttendeeLimit(req, context, RULES.wallet, async () => {
      const r = await subjectForAttendeeToken(token);
      return r.ok ? run(r.subject) : failure(r, false);
    });
  }
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const blocked = await guardUser(RULES.wallet, auth.user.id);
  if (blocked) return blocked;
  const r = await subjectForTeamUser(auth.user.id);
  return r.ok ? run(r.subject) : failure(r, true);
}

function notConfigured(cfg: WalletConfig, platform: 'apple' | 'google'): Response {
  console.error(`[wallet] ${platform} no disponible: ${cfg.problems[platform] ?? cfg.problems.qr ?? 'sin configurar'}`);
  return wallet(UNAVAILABLE, 503, 'not_configured');
}

export default handler(async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '');
  const cfg = loadWalletConfig();

  if (route === '/api/wallet/status') {
    if (req.method !== 'GET') return methodNotAllowed('GET');
    return json(walletAvailability(cfg));
  }

  if (route === '/api/wallet/diagnostics') {
    if (req.method !== 'GET') return methodNotAllowed('GET');
    const auth = await authorize(req, ['ADMIN']);
    if ('response' in auth) return auth.response;
    return json(walletDiagnostics()); // solo nombres de variables y veredictos; nunca valores
  }

  if (route === '/api/wallet/apple-ticket') {
    if (req.method !== 'POST') return methodNotAllowed('POST');
    if (!cfg.apple || !cfg.qrSecret) return notConfigured(cfg, 'apple');
    const secret = cfg.qrSecret;
    return withSubject(req, context, async (subject) => json({ url: `/api/wallet/apple?t=${encodeURIComponent(makeTicket(secret, subject.pulseId, 'apple'))}` }));
  }

  if (route === '/api/wallet/apple') {
    if (req.method !== 'GET') return methodNotAllowed('GET');
    if (!cfg.apple || !cfg.qrSecret) return notConfigured(cfg, 'apple');
    const pulseId = verifyTicket(cfg.qrSecret, url.searchParams.get('t'), 'apple');
    if (!pulseId) return wallet('El enlace venció. Vuelve a pulsar «Agregar a Apple Wallet».', 401, 'ticket_expired');
    const blocked = await guard([{ rule: RULES.wallet, id: scope('pulse', pulseId) }]);
    if (blocked) return blocked;
    const r = await subjectForPulseId(pulseId); // estado ACTUAL de la pulsera: una deshabilitada ya no emite pase
    if (!r.ok) return failure(r, r.reason === 'no_pulse');
    const body = buildPkpass(cfg.apple, cfg.qrSecret, r.subject);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { 'content-type': PKPASS_MIME, 'cache-control': 'no-store', 'content-disposition': 'inline; filename="arraigados-2k26.pkpass"' },
    });
  }

  if (route === '/api/wallet/google') {
    if (req.method !== 'POST') return methodNotAllowed('POST');
    if (!cfg.google || !cfg.qrSecret) return notConfigured(cfg, 'google');
    const { google, qrSecret } = cfg;
    return withSubject(req, context, async (subject) => json({ url: buildGoogleSaveUrl(google, qrSecret, subject) }));
  }

  return apiError('Ruta no encontrada.', 404);
});

export const config: Config = {
  path: ['/api/wallet/status', '/api/wallet/diagnostics', '/api/wallet/apple-ticket', '/api/wallet/apple', '/api/wallet/google'],
};

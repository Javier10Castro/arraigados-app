/**
 * Códigos firmados de la credencial digital.
 *
 * Código del QR del pase:   AR26W1.<pulseId>.<firma>
 *   · NO contiene el token privado de la pulsera ni ninguna sesión; solo el id interno de la pulsera y una firma HMAC-SHA256
 *     (clave WALLET_QR_SECRET, separada de SESSION_SECRET). La firma impide fabricar códigos de pulseras ajenas.
 *   · Es un identificador, NO una autorización: Staff lo lee con la cámara y el servidor revisa en cada lectura el estado
 *     real de la pulsera (activa / deshabilitada / inexistente). Cambiar el secreto invalida todos los pases emitidos.
 * Boleto de descarga de Apple: <payload>.<firma> con vencimiento corto, para que el navegador pueda abrir el .pkpass con un
 * GET normal (Safari no puede mandar cabeceras). Solo sirve para pedir el pase de esa pulsera durante unos segundos.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const WALLET_CODE_PREFIX = 'AR26W1';
/** Los ids de pulsera son cuid/uuid: solo estos caracteres (y nada que pueda romper el formato del código). */
const PULSE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const WALLET_CODE_RE = /^AR26W1\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{22})$/;
export const TICKET_TTL_SECONDS = 90;

const b64u = (buf: Buffer) => buf.toString('base64url');

function mac(secret: string, domain: string, data: string, bytes = 16): Buffer {
  return createHmac('sha256', secret).update(`${domain}|${data}`).digest().subarray(0, bytes);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function makeWalletCode(secret: string, pulseId: string): string {
  if (!PULSE_ID_RE.test(pulseId)) throw new Error('Id de pulsera con formato inesperado.');
  return `${WALLET_CODE_PREFIX}.${pulseId}.${b64u(mac(secret, 'wallet-code-v1', pulseId))}`;
}

/** Devuelve el id de pulsera si el código tiene formato y firma válidos; null en cualquier otro caso. */
export function verifyWalletCode(secret: string, code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const m = WALLET_CODE_RE.exec(code.trim());
  if (!m) return null;
  return safeEqual(m[2], b64u(mac(secret, 'wallet-code-v1', m[1]))) ? m[1] : null;
}

export const looksLikeWalletCode = (text: string) => WALLET_CODE_RE.test(text.trim());

/** Identificador público corto que se imprime en el pase (derivado de la firma; no sirve para nada por sí solo). */
export function publicCredentialId(secret: string, pulseId: string): string {
  const raw = mac(secret, 'wallet-id-v1', pulseId, 6);
  // Alfabeto de los códigos de respaldo (sin 0/O/1/I/L). Prefijo distinto (W26-) para que NUNCA se confunda con un código AR26-XXXXX real.
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let out = '';
  for (const byte of raw) out += ALPHABET[byte % ALPHABET.length];
  return `W26-${out.slice(0, 6)}`;
}

export type TicketKind = 'apple';

export function makeTicket(secret: string, pulseId: string, kind: TicketKind, nowMs = Date.now()): string {
  if (!PULSE_ID_RE.test(pulseId)) throw new Error('Id de pulsera con formato inesperado.');
  const payload = b64u(Buffer.from(JSON.stringify({ p: pulseId, k: kind, x: Math.floor(nowMs / 1000) + TICKET_TTL_SECONDS })));
  return `${payload}.${b64u(mac(secret, 'wallet-ticket-v1', payload, 24))}`;
}

export function verifyTicket(secret: string, ticket: unknown, kind: TicketKind, nowMs = Date.now()): string | null {
  if (typeof ticket !== 'string' || ticket.length > 400) return null;
  const [payload, sig, extra] = ticket.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, b64u(mac(secret, 'wallet-ticket-v1', payload, 24)))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p?: unknown; k?: unknown; x?: unknown };
    if (data.k !== kind || typeof data.p !== 'string' || !PULSE_ID_RE.test(data.p) || typeof data.x !== 'number') return null;
    if (data.x * 1000 < nowMs) return null;
    return data.p;
  } catch {
    return null;
  }
}

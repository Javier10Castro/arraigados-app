/**
 * Interpreta lo que se lee de una pulsera (QR) o se escribe a mano.
 *
 * Formatos (definidos en el proyecto Next.js, src/lib/tokens.ts -- NO cambiar
 * sin cambiar allá también):
 * - QR: URL completa `{dominio}/p/{qrToken}`; qrToken = 16 caracteres base62.
 *   El dominio NO se valida: en desarrollo los QR apuntan a localhost:3000
 *   (Next.js) y después apuntarán al dominio definitivo; el token es lo único
 *   que identifica la pulsera.
 * - Código de respaldo impreso: `AR26-XXXXX`, alfabeto sin 0/O/1/I/L.
 */

const QR_TOKEN = /^[0-9A-Za-z]{16}$/;
const MANUAL_CODE = /^AR26-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

export type PulseCode = { kind: 'token'; value: string } | { kind: 'manual'; value: string };

export function parsePulseCode(raw: string): PulseCode | null {
  const text = raw.trim();
  if (!text) return null;

  // Código de respaldo (tolerante a minúsculas y espacios alrededor del guion).
  const manual = text.toUpperCase().replace(/\s*-\s*/, '-');
  if (MANUAL_CODE.test(manual)) return { kind: 'manual', value: manual };

  // Token suelto.
  if (QR_TOKEN.test(text)) return { kind: 'token', value: text };

  // URL con /p/{token} (o /mi-congreso/{token}, por si alguien comparte ese link).
  try {
    const url = new URL(text);
    const match = url.pathname.match(/\/(?:p|mi-congreso)\/([0-9A-Za-z]{16})\/?$/);
    if (match) return { kind: 'token', value: match[1] };
  } catch {
    // no es URL
  }
  return null;
}

/** Ruta de Vite a la que se manda una pulsera leída (token o código). */
export function pulsePath(code: PulseCode) {
  return `/p/${encodeURIComponent(code.value)}`;
}

import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { PLANTILLA_CARD_PNG, PLANTILLA_H, PLANTILLA_W } from './plantilla.generated';
import { QR_TOKEN_RE, type PaperSize } from '../shared/api';

/**
 * Etapa 3 — Lotes: definición física de la pulsera y del QR.
 *
 * TODO LO QUE AFECTA EL TAMAÑO IMPRESO SE DEFINE AQUÍ Y EN NINGÚN OTRO LUGAR.
 *
 * TAMAÑO DE LA TARJETA (requisito físico, pedido explícito)
 *   La tarjeta mide EXACTAMENTE 5 cm de ancho x 3.5 cm de alto. Se fija en
 *   puntos PDF reales (1 in = 72 pt, 1 cm = 72/2.54 pt), no se deriva de los
 *   píxeles de la plantilla ni se escala para llenar la hoja. Si sobra espacio
 *   en el papel, se deja espacio.
 *
 *   La plantilla mide 591 x 413 px (proporción 1.43099) y la tarjeta 5 x 3.5 cm
 *   (proporción 1.42857): la diferencia es de 0.17% en el ancho, es decir
 *   0.086 mm sobre una tarjeta de 50 mm. Se estira de todos modos porque el
 *   requisito es el tamaño físico exacto, no "lo que salga de mantener la
 *   proporción". Estirar por separado en X e Y (no con un factor único) es
 *   indispensable: si no, el recuadro del QR se descentra respecto al diseño.
 *
 * PLANTILLA
 *   src/assets/plantillas/template_card_clean.png, copia byte a byte de
 *   Arraigados\qr_template\template_card_clean.png (plantilla v3 del
 *   30 sep 2026): recuadro de esquinas redondeadas con el relleno crema
 *   #F2F7D7 ya horneado dentro del trazo. Viene incrustada en base64 por
 *   `server/plantilla.generated.ts` (npm run plantilla:base64) para que la
 *   Netlify Function no dependa de leer archivos del disco en producción.
 *
 *   QR_BOX son los píxeles del recuadro donde va el QR, medidos a mano contra
 *   el borde interior del trazo (los mismos valores que usa
 *   Arraigados\qr_template\generate_wristband.py y
 *   Arraigados\src\lib\wristband-pdf.ts; mantener sincronizado si la
 *   plantilla vuelve a cambiar). Es un inset DENTRO del relleno crema, para
 *   que quede margen crema visible alrededor del QR en vez de que toque borde
 *   a borde.
 */

const IN = 72; // puntos por pulgada
export const CM = IN / 2.54; // 28.3465 puntos por centímetro

/** Tamaño físico obligatorio de cada pulsera impresa. */
export const CARD_W = 5 * CM; // 141.7323 pt  = 50.0 mm
export const CARD_H = 3.5 * CM; // 99.2126 pt  = 35.0 mm

/** Con tarjetas tan chicas un margen generoso desperdicia espacio. */
export const MARGIN = 0.25 * IN; // 18.0 pt = 6.35 mm
export const GUTTER = 0.1 * IN; //  7.2 pt = 2.54 mm

/** Relleno crema de la plantilla y fondo del QR (deben coincidir). */
export const CREAM = '#F2F7D7';

export { PLANTILLA_CARD_PNG, PLANTILLA_H, PLANTILLA_W };

/** Recuadro del QR dentro de la plantilla, en píxeles (origen arriba-izquierda). */
export const QR_BOX = { left: 251, top: 79, right: 505, bottom: 333 };

/** Tamaño de página en puntos PDF. Always vertical (portrait). */
export const PAGE_POINTS: Record<PaperSize, { w: number; h: number; mm: string }> = {
  a4: { w: 595.28, h: 841.89, mm: '210 × 297 mm' },
  letter: { w: 612, h: 792, mm: '215.9 × 279.4 mm (8.5 × 11 in)' },
  tabloid: { w: 792, h: 1224, mm: '279.4 × 431.8 mm (11 × 17 in)' },
};

/**
 * Cuántas tarjetas caben en una hoja, y dónde empieza la cuadrícula.
 *
 * NUNCA se reduce la tarjeta: se cuentan cuántas caben con el tamaño fijo de
 * arriba y el sobrante se reparte como margen (centrado). La separación
 * (GUTTER) existe porque la plantilla trae el trazo de esquinas redondeadas
 * ya horneado: sin separación las tarjetas se tocan al cortar.
 *
 * A4      -> 3 x 7  = 21 tarjetas por hoja
 * Carta   -> 3 x 7  = 21 tarjetas por hoja
 * Tabloide-> 5 x 11 = 55 tarjetas por hoja
 */
export function layoutFor(paper: PaperSize) {
  const { w: pageW, h: pageH } = PAGE_POINTS[paper];
  const usableW = pageW - 2 * MARGIN;
  const usableH = pageH - 2 * MARGIN;
  const cols = Math.max(1, Math.floor((usableW + GUTTER) / (CARD_W + GUTTER)));
  const rows = Math.max(1, Math.floor((usableH + GUTTER) / (CARD_H + GUTTER)));
  const gridW = cols * CARD_W + (cols - 1) * GUTTER;
  const gridH = rows * CARD_H + (rows - 1) * GUTTER;
  return {
    cols,
    rows,
    perPage: cols * rows,
    offsetX: MARGIN + (usableW - gridW) / 2,
    offsetY: MARGIN + (usableH - gridH) / 2,
    gridW,
    gridH,
  };
}

/**
 * Origen público de los QR.
 *
 * 1. PUBLIC_BASE_URL del .env, si existe (en producción: el dominio real).
 * 2. Si falta y la petición llegó a localhost (desarrollo), el mismo origen de
 *    la petición: con `npm run dev` queda http://localhost:8888/p/{qrToken}
 *    (decisión del 1 oct 2026: el enlace de desarrollo usa el 8888, donde
 *    viven la app y las funciones).
 * 3. Si falta y NO es localhost, error: en producción nunca se adivina el
 *    dominio, porque queda grabado en cada QR impreso.
 *
 * Los QR con localhost NO son material oficial de impresión.
 */
export function publicBaseUrl(req?: Request): string {
  const raw = String(process.env.PUBLIC_BASE_URL ?? '').trim();
  if (raw) {
    // "localhost:8888" (sin http://) se acepta en desarrollo: se completa a http://.
    const value = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw) ? `http://${raw}` : raw;
    if (!/^https?:\/\//i.test(value)) {
      throw new Error(`PUBLIC_BASE_URL debe empezar con http:// o https:// (valor recibido: ${raw}).`);
    }
    return value.replace(/\/+$/, '');
  }
  const local = localOrigin(req);
  if (local) return local;
  throw new Error(
    'Falta PUBLIC_BASE_URL en el archivo .env de arraigados-app (ver .env.example). ' +
      'Es el origen con el que se arman los QR de las pulseras.',
  );
}

/** Origen de la petición solo si es localhost / 127.0.0.1 (desarrollo). */
function localOrigin(req?: Request): string {
  if (!req) return '';
  try {
    const url = new URL(req.url);
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? url.origin : '';
  } catch {
    return '';
  }
}

/** Enlace completo de una pulsera. Es la única identificación. */
export function pulseUrl(qrToken: string, base: string): string {
  return `${base}/p/${qrToken}`;
}

/**
 * Igual que publicBaseUrl() pero sin lanzar: para el listado y el detalle de
 * lotes. Si no hay dominio configurado (y no es localhost), el enlace queda
 * vacío y la pantalla lo avisa; lo que falla es imprimir.
 */
export function baseUrlOrEmpty(req?: Request): string {
  try {
    return publicBaseUrl(req);
  } catch {
    return '';
  }
}

/** Representación corta y legible del token para la tabla (los 4 primeros). */
export function shortToken(qrToken: string): string {
  return `${qrToken.slice(0, 4)}…`;
}

/**
 * Matriz del QR de una pulsera (los mismos parámetros que qrPng: nivel 'Q').
 * El PDF la dibuja como vectores: es exacta a cualquier escala y evita
 * comprimir/incrustar 500 imágenes PNG, que era lo que hacía que el PDF de un
 * lote de 500 tardara más de 30 s y la función se cortara.
 */
export function qrMatrix(qrToken: string, base: string): { size: number; isDark: (row: number, col: number) => boolean } {
  if (!QR_TOKEN_RE.test(qrToken)) throw new Error('qrToken inválido.');
  const { modules } = QRCode.create(pulseUrl(qrToken, base), { errorCorrectionLevel: 'Q' });
  return { size: modules.size, isDark: (row, col) => Boolean(modules.data[row * modules.size + col]) };
}

/** Módulos de zona quieta alrededor del QR (igual que `margin: 1` de qrPng). */
export const QR_QUIET_MODULES = 1;

export type QrPngOptions = { size?: number };

/**
 * PNG del QR de una pulsera, negro sobre crema.
 *
 * - errorCorrectionLevel 'Q' (~25% de recuperación) en vez de 'M' (~15%): la
 *   tarjeta es de 5x3.5 cm, el QR impreso mide ~2.1 cm y además va en una
 *   pulsera que se dobla en la muñeca; más tolerancia a dobleces, reflejos y
 *   rayones vale más que la densidad extra de módulos.
 * - margin 1 = un módulo de zona quieta, como el QR de la referencia.
 * - El fondo crema no es decorativo: hace que el QR se funda con el relleno
 *   horneado en la plantilla.
 */
export function qrPng(qrToken: string, base: string, { size = 600 }: QrPngOptions = {}): Promise<Buffer> {
  if (!QR_TOKEN_RE.test(qrToken)) throw new Error('qrToken inválido.');
  return QRCode.toBuffer(pulseUrl(qrToken, base), {
    type: 'png',
    errorCorrectionLevel: 'Q',
    margin: 1,
    width: size,
    color: { dark: '#000000', light: CREAM },
  });
}

/**
 * PNG de la TARJETA completa de una pulsera: la plantilla oficial con el QR
 * dentro de su recuadro (lo mismo que sale en el PDF, pero suelto). Es lo que
 * baja el botón "Descargar" de cada pulsera.
 *
 * - Tamaño: el de la plantilla, 591 × 413 px = 50 × 35 mm a 300 ppp.
 * - El QR se dibuja módulo por módulo con un tamaño ENTERO de píxel (sin
 *   escalar ni suavizar), centrado en QR_BOX sobre fondo crema: queda nítido
 *   y se escanea igual que el del PDF (mismo contenido, nivel 'Q', 1 módulo
 *   de zona quieta).
 */
export function qrCardPng(qrToken: string, base: string): Buffer {
  const png = PNG.sync.read(Buffer.from(PLANTILLA_CARD_PNG));
  const m = qrMatrix(qrToken, base);
  const total = m.size + 2 * QR_QUIET_MODULES;
  const boxW = QR_BOX.right - QR_BOX.left;
  const boxH = QR_BOX.bottom - QR_BOX.top;
  const unit = Math.floor(Math.min(boxW, boxH) / total);
  const side = unit * total;
  const x0 = QR_BOX.left + Math.floor((boxW - side) / 2);
  const y0 = QR_BOX.top + Math.floor((boxH - side) / 2);

  const cream = [0xf2, 0xf7, 0xd7];
  const paint = (x: number, y: number, w: number, h: number, rgb: number[]) => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = (yy * png.width + xx) * 4;
        png.data[i] = rgb[0];
        png.data[i + 1] = rgb[1];
        png.data[i + 2] = rgb[2];
        png.data[i + 3] = 255;
      }
    }
  };

  paint(x0, y0, side, side, cream);
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.isDark(r, c)) {
        paint(x0 + (c + QR_QUIET_MODULES) * unit, y0 + (r + QR_QUIET_MODULES) * unit, unit, unit, [0, 0, 0]);
      }
    }
  }
  return PNG.sync.write(png);
}

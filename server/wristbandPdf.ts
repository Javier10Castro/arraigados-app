import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import {
  CARD_H,
  CARD_W,
  CM,
  GUTTER,
  MARGIN,
  PAGE_POINTS,
  PLANTILLA_CARD_PNG,
  PLANTILLA_H,
  PLANTILLA_W,
  QR_BOX,
  QR_QUIET_MODULES,
  layoutFor,
  qrMatrix,
} from './wristband';
import type { PaperSize } from '../shared/api';

/**
 * Etapa 3 — Lotes: PDF imprimible del lote completo.
 *
 * Puerto fiel de Arraigados\src\lib\wristband-pdf.ts (el Next.js es solo
 * referencia funcional: aquí no se copia su UI ni su arquitectura, solo el
 * resultado impreso). Lo que cambia respecto a la referencia:
 *
 *   1. La plantilla va incrustada en base64 en lugar de leerse con fs del
 *      disco, porque una Netlify Function solo recibe los archivos listados en
 *      `includedFiles` (ver server/plantilla.generated.ts).
 *   2. Las medidas físicas viven en server/wristband.ts y se calculan UNA vez.
 *   3. Se acepta `tokens` en vez de objetos con qrToken+manualCode: desde la
 *      Etapa 3 la pulsera se identifica solo por qrToken.
 *
 * Lo que se mantiene igual a propósito: 5 x 3.5 cm fijos, estiramiento
 * independiente en X e Y de la plantilla, QR cuadrado centrado dentro del
 * recuadro, guía de corte punteada, errorCorrection 'Q', margen 1, crema
 * #F2F7D7 y la regla de calibración de 5 cm al pie de cada página.
 *
 *   4. (Claude, 1 oct 2026) El QR se dibuja como vector y no como PNG
 *      incrustado: con PNG, un lote de 500 tardaba >30 s y la función se
 *      cortaba sin entregar el PDF. Mismo contenido, mismo nivel 'Q', misma
 *      zona quieta de 1 módulo y mismo tamaño en papel.
 *
 * La regla de calibración existe porque el PDF no es el problema cuando el
 * tamaño se escala mal: el problema es el diálogo de impresión, que muchos
 * visores traen con "ajustar a la página" activo y reescala todo en silencio.
 * Con la regla, quien imprima verifica con una regla física, en un segundo,
 * que la hoja salió a escala real.
 */

export type PulseForPdf = { qrToken: string };

/** #F2F7D7, el mismo crema de la plantilla y de qrPng. */
const CREAM_RGB = rgb(0xf2 / 255, 0xf7 / 255, 0xd7 / 255);

/** `base` = origen de los QR (publicBaseUrl). */
export async function buildBatchPdf(tokens: PulseForPdf[], paper: PaperSize, base: string): Promise<Uint8Array> {
  const { w: pageW, h: pageH } = PAGE_POINTS[paper];
  const layout = layoutFor(paper);

  const pdfDoc = await PDFDocument.create();
  // La plantilla se incrusta una sola vez y se reutiliza en todas las páginas
  // (un solo objeto de imagen en el PDF, referenciado por cada tarjeta).
  const templateImage = await pdfDoc.embedPng(PLANTILLA_CARD_PNG);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Escala por separado en X/Y: el tamaño pedido (5 x 3.5 cm) no es
  // exactamente la proporción nativa de la plantilla (591 x 413 px), así que
  // la plantilla se estira levemente para encajar en el tamaño físico exacto.
  // El recuadro del QR tiene que estirarse con la misma proporción para seguir
  // cayendo en su lugar.
  const scaleX = CARD_W / PLANTILLA_W;
  const scaleY = CARD_H / PLANTILLA_H;

  // PDF usa origen inferior-izquierdo; QR_BOX se midió desde arriba.
  const boxLeft = QR_BOX.left * scaleX;
  const boxBottom = (PLANTILLA_H - QR_BOX.bottom) * scaleY;
  const boxW = (QR_BOX.right - QR_BOX.left) * scaleX;
  const boxH = (QR_BOX.bottom - QR_BOX.top) * scaleY;
  // El recuadro es ligeramente rectangular; el QR va cuadrado y centrado.
  const qrSize = Math.min(boxW, boxH);
  const qrOffsetX = (boxW - qrSize) / 2;
  const qrOffsetY = (boxH - qrSize) / 2;

  // Regla de calibración: a 14 pt (4.9 mm) del borde inferior, dentro del área
  // que imprimen las impresoras de oficina (suelen dejar ~4.2 mm sin imprimir;
  // a 6 pt / 2.1 mm, como estaba, la regla se perdía). El texto va a la derecha
  // de la línea, en el mismo renglón, para no invadir la guía de corte de la
  // última fila en Carta (donde la cuadrícula queda a ~9.6 mm del borde).
  function drawCalibrationRuler(p: PDFPage) {
    const rulerW = 5 * CM;
    const y = 14;
    const x = MARGIN;
    const color = rgb(0.3, 0.3, 0.3);
    p.drawLine({ start: { x, y }, end: { x: x + rulerW, y }, thickness: 1, color });
    p.drawLine({ start: { x, y: y - 3 }, end: { x, y: y + 3 }, thickness: 1, color });
    p.drawLine({ start: { x: x + rulerW, y: y - 3 }, end: { x: x + rulerW, y: y + 3 }, thickness: 1, color });
    p.drawText('<- Esta linea debe medir 5 cm. Si no, imprime a tamano real / 100% (no "ajustar a la pagina").', {
      x: x + rulerW + 6,
      y: y - 2,
      size: 6,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  /**
   * QR vectorial: fondo crema (incluye la zona quieta) y un trazo con todos
   * los módulos oscuros, agrupados en tramos horizontales. Un solo
   * `drawSvgPath` por QR, en unidades de módulo escaladas al tamaño real.
   */
  function drawQr(p: PDFPage, qrToken: string, x: number, y: number, size: number) {
    const m = qrMatrix(qrToken, base);
    const total = m.size + 2 * QR_QUIET_MODULES;
    const unit = size / total;
    p.drawRectangle({ x, y, width: size, height: size, color: CREAM_RGB });
    let path = '';
    for (let r = 0; r < m.size; r++) {
      let c = 0;
      while (c < m.size) {
        if (!m.isDark(r, c)) {
          c++;
          continue;
        }
        const start = c;
        while (c < m.size && m.isDark(r, c)) c++;
        path += `M${start + QR_QUIET_MODULES} ${r + QR_QUIET_MODULES}h${c - start}v1h${start - c}z`;
      }
    }
    // drawSvgPath usa coordenadas SVG (y hacia abajo) con origen en (x, y): se
    // ancla en la esquina superior izquierda del QR.
    p.drawSvgPath(path, { x, y: y + size, scale: unit, color: rgb(0, 0, 0), borderWidth: 0 });
  }

  let page = pdfDoc.addPage([pageW, pageH]);
  drawCalibrationRuler(page);
  let indexOnPage = 0;

  for (const { qrToken } of tokens) {
    if (indexOnPage === layout.perPage) {
      page = pdfDoc.addPage([pageW, pageH]);
      drawCalibrationRuler(page);
      indexOnPage = 0;
    }

    const col = indexOnPage % layout.cols;
    const row = Math.floor(indexOnPage / layout.cols);
    const cardX = layout.offsetX + col * (CARD_W + GUTTER);
    // La fila 0 va arriba: se dibuja desde el borde superior de la cuadrícula hacia abajo.
    const cardY = layout.offsetY + layout.gridH - CARD_H - row * (CARD_H + GUTTER);

    // Guía de corte punteada, un poco más grande que la tarjeta.
    page.drawRectangle({
      x: cardX - 3,
      y: cardY - 3,
      width: CARD_W + 6,
      height: CARD_H + 6,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 0.5,
      borderDashArray: [3, 3],
    });

    page.drawImage(templateImage, { x: cardX, y: cardY, width: CARD_W, height: CARD_H });

    drawQr(page, qrToken, cardX + boxLeft + qrOffsetX, cardY + boxBottom + qrOffsetY, qrSize);

    indexOnPage++;
  }

  return pdfDoc.save();
}

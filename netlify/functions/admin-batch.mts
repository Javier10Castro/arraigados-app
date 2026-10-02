import type { Config, Context } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { batchTokens, getBatch, pulseTokenInBatch } from '../../server/batches';
import { baseUrlOrEmpty, publicBaseUrl, qrCardPng } from '../../server/wristband';
import { buildBatchPdf } from '../../server/wristbandPdf';
import { apiError, handler, json, methodNotAllowed } from '../../server/http';
import { PAPER_SIZES, type PaperSize } from '../../shared/api';

/**
 * GET /api/admin/batches/:id                      -> detalle + tabla de pulseras
 * GET /api/admin/batches/:id/pdf?size=a4|letter|tabloid -> PDF del lote (application/pdf)
 * GET /api/admin/batches/:id/pulses/:pulseId/qr   -> PNG del QR suelto (image/png)
 *
 * Solo ADMIN. El PDF y el PNG se devuelven como binario, no como JSON.
 */
export default handler(async (req: Request, context: Context) => {
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;
  if (req.method !== 'GET') return methodNotAllowed('GET');

  const path = new URL(req.url).pathname;
  const id = context.params.id ?? '';
  // Sin id = 404 y no 400: cuando una función responde 404, `netlify dev`
  // reintenta la misma ruta como archivo estático (…/index.html) y esa
  // segunda llamada llega aquí sin parámetros. Con 400 el Admin veía
  // "Falta el lote" en vez de "Ese lote no existe".
  if (!id) {
    return apiError(path.includes('/pulses/') ? 'Esa pulsera no existe en este lote.' : 'Ese lote no existe.', 404);
  }

  /* --- PDF del lote ------------------------------------------------- */
  if (path.endsWith('/pdf')) {
    const sizeParam = new URL(req.url).searchParams.get('size') ?? 'a4';
    if (!(PAPER_SIZES as readonly string[]).includes(sizeParam)) {
      return apiError('Formato de papel inválido. Usa a4, letter o tabloid.');
    }
    const paper = sizeParam as PaperSize;
    const found = await batchTokens(id);
    if (!found) return apiError('Ese lote no existe.', 404);

    const bytes = await buildBatchPdf(found.tokens, paper, publicBaseUrl(req));
    const filename = `pulseras-${slug(found.code)}-${paper}.pdf`;
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
        // El PDF se arma en el servidor con el dominio de PUBLIC_BASE_URL: el
        // navegador no tiene que ver esa variable.
        'x-content-type-options': 'nosniff',
      },
    });
  }

  /* --- QR suelto de una pulsera ------------------------------------ */
  if (path.endsWith('/qr')) {
    const pulseId = context.params.pulseId ?? '';
    const pulse = await pulseTokenInBatch(id, pulseId);
    if (!pulse) return apiError('Esa pulsera no existe en este lote.', 404);
    // Una pulsera deshabilitada (reemplazada) no se vuelve a imprimir.
    if (pulse.status === 'INVALIDATED') {
      return apiError('Esta pulsera está deshabilitada: ya fue reemplazada y no se puede descargar.', 409);
    }
    const { qrToken } = pulse;
    // Tarjeta completa (plantilla + QR), 50 × 35 mm a 300 ppp.
    const png = qrCardPng(qrToken, publicBaseUrl(req));
    return new Response(new Uint8Array(png) as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-disposition': `attachment; filename="pulsera-${slug(qrToken)}.png"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  /* --- Detalle ------------------------------------------------------- */
  const qs = new URL(req.url).searchParams;
  const batch = await getBatch(id, baseUrlOrEmpty(req), {
    page: Number(qs.get('page') ?? 0),
    pageSize: Number(qs.get('pageSize') ?? 0),
    q: qs.get('q') ?? '',
    status: qs.get('status') ?? '',
  });
  if (!batch) return apiError('Ese lote no existe.', 404);
  return json(batch);
});

function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'lote'
  );
}

export const config: Config = {
  path: [
    '/api/admin/batches/:id',
    '/api/admin/batches/:id/pdf',
    '/api/admin/batches/:id/pulses/:pulseId/qr',
  ],
};

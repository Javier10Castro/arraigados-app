import type { Config } from '@netlify/functions';
import { authorize } from '../../server/auth';
import { DashboardError, parseFilters } from '../../server/dashboard';
import { buildDashboardPdf, buildDashboardXlsx } from '../../server/dashboardExport';
import { apiError, handler, methodNotAllowed } from '../../server/http';

/**
 * GET /api/admin/dashboard/export?format=pdf|xlsx&period=&zoneId=&presbyteryId=&churchId=&packageId=
 *
 * Etapa 4 -- exportación del Dashboard. Mismos filtros que GET
 * /api/admin/dashboard (se parsean con el mismo `parseFilters`, así que un
 * reporte exportado con un periodo/zona/iglesia/kit siempre corresponde a lo
 * que el Admin está viendo en pantalla, nunca a datos globales). Solo ADMIN,
 * revalidado aquí en el servidor igual que el resto de /api/admin/*.
 *
 * Devuelve binario (PDF o XLSX), nunca JSON, salvo en caso de error.
 */
export default handler(async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const auth = await authorize(req, ['ADMIN']);
  if ('response' in auth) return auth.response;

  const qs = new URL(req.url).searchParams;
  const format = qs.get('format');
  if (format !== 'pdf' && format !== 'xlsx') {
    return apiError('Formato de exportación inválido. Usa pdf o xlsx.', 400);
  }

  try {
    const filters = parseFilters(qs);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

    if (format === 'pdf') {
      const bytes = await buildDashboardPdf(filters);
      return new Response(bytes as BodyInit, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="dashboard-arraigados-${stamp}.pdf"`,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    }

    const bytes = await buildDashboardXlsx(filters);
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="dashboard-arraigados-${stamp}.xlsx"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof DashboardError) return apiError(err.message, 400);
    console.error('[admin-dashboard-export]', err);
    return apiError('No se pudo generar el archivo. Intenta de nuevo.', 500);
  }
});

export const config: Config = { path: '/api/admin/dashboard/export' };

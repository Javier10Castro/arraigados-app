import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { getDashboard, type DashboardError as DashboardErrorClass } from './dashboard';
import { query } from './db';
import {
  EVENT_DAYS,
  type DashboardFilters,
  type DashboardResponse,
} from '../shared/api';

/**
 * Etapa 4 — Exportación del Dashboard (PDF y Excel).
 *
 * Reutiliza TAL CUAL `getDashboard(filters)` (server/dashboard.ts): el PDF y
 * el Excel muestran exactamente los mismos números que la pantalla para los
 * mismos filtros, nunca una consulta aparte que pudiera desalinearse.
 *
 * Alcance deliberado (documentado también en docs/CLAUDE_HANDOFF.md §40):
 * las "gráficas" del Dashboard (barras, dona) no se rasterizan como imagen
 * -- pdf-lib no dibuja gráficas y agregar una librería de canvas solo para
 * esto no pasa la regla de "no agregar dependencias innecesarias" (§23 del
 * encargo). En su lugar, cada gráfica se exporta como SU MISMA tabla de
 * datos (zonas, presbiterios, iglesias, edades, canjes por Staff), que es la
 * información real detrás de la gráfica, no un relleno visual.
 */

export class DashboardExportError extends Error {}

async function resolveFilterLabels(f: Required<DashboardFilters>) {
  const [zone, presbytery, church, pkg] = await Promise.all([
    f.zoneId ? query<{ name: string }>(`SELECT name FROM "Zone" WHERE id = $1`, [f.zoneId]) : null,
    f.presbyteryId ? query<{ name: string }>(`SELECT name FROM "Presbytery" WHERE id = $1`, [f.presbyteryId]) : null,
    f.churchId ? query<{ name: string }>(`SELECT name FROM "Church" WHERE id = $1`, [f.churchId]) : null,
    f.packageId ? query<{ name: string }>(`SELECT name FROM "Package" WHERE id = $1`, [f.packageId]) : null,
  ]);
  return {
    zone: zone?.rows[0]?.name ?? null,
    presbytery: presbytery?.rows[0]?.name ?? null,
    church: church?.rows[0]?.name ?? null,
    package: pkg?.rows[0]?.name ?? null,
  };
}

const PERIOD_LABEL = (period: DashboardResponse['filters']['period']): string => {
  if (period === 'all') return 'Todo';
  if (period === 'today') return 'Hoy';
  if (period === 'yesterday') return 'Ayer';
  const day = EVENT_DAYS.find((d) => d.date === period);
  return day ? day.label : period;
};

/* ------------------------------------------------------------------ */
/* PDF                                                                   */
/* ------------------------------------------------------------------ */

const PAGE_W = 612; // Carta (pt)
const PAGE_H = 792;
const MARGIN = 42;

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  private ensure(space: number) {
    if (this.y - space < MARGIN) {
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.y = PAGE_H - MARGIN;
    }
  }

  h1(text: string) {
    this.ensure(26);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 20, font: this.bold, color: rgb(0.24, 0.03, 0.65) });
    this.y -= 26;
  }

  h2(text: string) {
    this.ensure(22);
    this.y -= 6;
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 13, font: this.bold, color: rgb(0.12, 0.12, 0.12) });
    this.y -= 16;
  }

  p(text: string, size = 10) {
    this.ensure(size + 4);
    this.page.drawText(text, { x: MARGIN, y: this.y, size, font: this.font, color: rgb(0.3, 0.3, 0.3) });
    this.y -= size + 4;
  }

  row(cells: string[], widths: number[], opts: { bold?: boolean; size?: number } = {}) {
    const size = opts.size ?? 9.5;
    this.ensure(size + 6);
    let x = MARGIN;
    cells.forEach((cell, i) => {
      this.page.drawText(truncate(cell, widths[i], size), {
        x,
        y: this.y,
        size,
        font: opts.bold ? this.bold : this.font,
        color: rgb(0.15, 0.15, 0.15),
      });
      x += widths[i];
    });
    this.y -= size + 6;
  }

  rule() {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 2 },
      end: { x: PAGE_W - MARGIN, y: this.y + 2 },
      thickness: 0.6,
      color: rgb(0.85, 0.85, 0.85),
    });
    this.y -= 8;
  }

  table(headers: string[], widths: number[], rows: string[][]) {
    this.row(headers, widths, { bold: true });
    this.rule();
    if (rows.length === 0) {
      this.p('(sin datos)', 9.5);
      return;
    }
    for (const r of rows) this.row(r, widths);
  }
}

function truncate(text: string, width: number, size: number): string {
  const maxChars = Math.max(4, Math.floor(width / (size * 0.52)));
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
}

const money = (cents: number) => `$${(cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
const pct = (used: number, total: number) => (total > 0 ? `${Math.round((used / total) * 100)}%` : '—');

export async function buildDashboardPdf(filters: Required<DashboardFilters>): Promise<Uint8Array> {
  const data = await getDashboard(filters);
  const labels = await resolveFilterLabels(filters);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  w.h1('Arraigados 2K26');
  w.p('Reporte del Dashboard', 13);
  w.p(`Generado: ${new Date(data.generatedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })} (hora de Tijuana)`);
  w.p(`Periodo: ${PERIOD_LABEL(data.filters.period)}`);
  const activeFilters = [
    labels.zone && `Zona: ${labels.zone}`,
    labels.presbytery && `Presbiterio: ${labels.presbytery}`,
    labels.church && `Iglesia: ${labels.church}`,
    labels.package && `Kit: ${labels.package}`,
  ].filter(Boolean) as string[];
  w.p(activeFilters.length ? `Filtros: ${activeFilters.join(' · ')}` : 'Filtros: ninguno (todos los datos)');

  w.h2('Indicadores');
  w.table(
    ['Indicador', 'Valor'],
    [260, 200],
    [
      ['Registrados', String(data.registered)],
      ['Registrados hoy', String(data.registeredToday)],
      ['Registrados ayer', String(data.registeredYesterday)],
      ['Valor estimado de kits', money(data.valueCents)],
      ['Aguas incluidas', String(data.drinks.included)],
      ['Aguas canjeadas', `${data.drinks.used} (${pct(data.drinks.used, data.drinks.included)})`],
      ['Aguas disponibles', String(data.drinks.remaining)],
      ['Iglesias con registrados', String(data.coverage.churches)],
      ['Presbiterios con registrados', String(data.coverage.presbyteries)],
      ['Zonas con registrados', String(data.coverage.zones)],
      ['Pulseras totales', String(data.pulses.total)],
      ['Pulseras activas', String(data.pulses.active)],
      ['Pulseras sin reclamar', String(data.pulses.unclaimed)],
      ['Pulseras deshabilitadas', String(data.pulses.invalidated)],
      ['Canjes', String(data.redemptions.count)],
      ['Aguas entregadas (canjes)', String(data.redemptions.drinks)],
    ],
  );

  w.h2('Kits');
  w.table(
    ['Kit', 'Precio', 'Aguas incl.', 'Registrados', 'Valor'],
    [150, 90, 90, 90, 90],
    data.kits.map((k) => [k.name, money(k.price), String(k.includedDrinks), String(k.count), money(k.valueCents)]),
  );

  if (data.eventDays) {
    w.h2('Sábado vs Domingo');
    w.table(
      ['Día', 'Registros', 'Canjes', 'Aguas'],
      [220, 100, 100, 90],
      data.eventDays.map((d) => [d.label, String(d.registrations), String(d.redemptions), String(d.drinks)]),
    );
  }

  w.h2('Por zona');
  w.table(['Zona', 'Registrados'], [350, 150], data.byZone.map((z) => [z.name, String(z.count)]));

  w.h2('Por presbiterio');
  w.table(
    ['Presbiterio', 'Zona', 'Registrados'],
    [260, 150, 90],
    data.byPresbytery.map((p) => [p.name, p.zoneName, String(p.count)]),
  );

  w.h2('Iglesias (top 10)');
  w.table(
    ['Iglesia', 'Presbiterio', 'Registrados'],
    [260, 150, 90],
    data.topChurches.map((c) => [c.name, c.presbyteryName, String(c.count)]),
  );

  w.h2('Por rango de edad');
  w.table(
    ['Rango', 'Registrados'],
    [350, 150],
    data.ages.map((a) => [a.range ?? 'Sin dato', String(a.count)]),
  );

  w.h2('Canjes por Staff');
  w.table(
    ['Staff', 'Canjes', 'Último canje'],
    [260, 100, 150],
    data.redemptions.byStaff.map((s) => [s.name, String(s.count), new Date(s.lastAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })]),
  );

  w.h2('Lotes');
  w.table(
    ['Lote', 'Kit', 'Estado', 'Total', 'Activas', 'Sin reclamar', 'Deshabilitadas'],
    [90, 110, 70, 50, 60, 85, 90],
    data.batches.map((b) => [b.code, b.packageName, b.status, String(b.total), String(b.active), String(b.unclaimed), String(b.invalidated)]),
  );

  if (data.alerts.length) {
    w.h2('Alertas operativas');
    w.table(
      ['Nivel', 'Título', 'Detalle'],
      [60, 170, 270],
      data.alerts.map((al) => [al.level, al.title, al.detail]),
    );
  }

  w.h2('Actividad reciente');
  w.table(
    ['Fecha', 'Tipo', 'Asistente', 'Iglesia', 'Staff'],
    [100, 80, 150, 110, 60],
    data.activity
      .slice(0, 40)
      .map((ac) => [
        new Date(ac.at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
        ac.type === 'registration' ? 'Registro' : ac.type === 'redemption' ? 'Canje' : 'Reemplazo',
        ac.attendeeName,
        ac.churchName,
        ac.staffName ?? '—',
      ]),
  );

  return doc.save();
}

/* ------------------------------------------------------------------ */
/* Excel                                                                */
/* ------------------------------------------------------------------ */

export async function buildDashboardXlsx(filters: Required<DashboardFilters>): Promise<Uint8Array> {
  const data = await getDashboard(filters);
  const labels = await resolveFilterLabels(filters);

  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, rows: Record<string, unknown>[]) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  };

  addSheet('Summary', [
    { Campo: 'Reporte', Valor: 'Arraigados 2K26 · Dashboard' },
    { Campo: 'Generado', Valor: data.generatedAt },
    { Campo: 'Periodo', Valor: PERIOD_LABEL(data.filters.period) },
    { Campo: 'Zona', Valor: labels.zone ?? 'Todas' },
    { Campo: 'Presbiterio', Valor: labels.presbytery ?? 'Todos' },
    { Campo: 'Iglesia', Valor: labels.church ?? 'Todas' },
    { Campo: 'Kit', Valor: labels.package ?? 'Todos' },
    { Campo: 'Registrados', Valor: data.registered },
    { Campo: 'Registrados hoy', Valor: data.registeredToday },
    { Campo: 'Registrados ayer', Valor: data.registeredYesterday },
    { Campo: 'Valor estimado (centavos MXN)', Valor: data.valueCents },
    { Campo: 'Aguas incluidas', Valor: data.drinks.included },
    { Campo: 'Aguas canjeadas', Valor: data.drinks.used },
    { Campo: 'Aguas disponibles', Valor: data.drinks.remaining },
    { Campo: 'Pulseras totales', Valor: data.pulses.total },
    { Campo: 'Pulseras activas', Valor: data.pulses.active },
    { Campo: 'Pulseras sin reclamar', Valor: data.pulses.unclaimed },
    { Campo: 'Pulseras deshabilitadas', Valor: data.pulses.invalidated },
    { Campo: 'Canjes', Valor: data.redemptions.count },
    { Campo: 'Aguas entregadas (canjes)', Valor: data.redemptions.drinks },
  ]);

  addSheet(
    'Kits',
    data.kits.map((k) => ({ Kit: k.name, 'Precio (centavos)': k.price, 'Aguas incluidas': k.includedDrinks, Registrados: k.count, 'Valor (centavos)': k.valueCents })),
  );

  addSheet(
    'ByDay',
    data.byDay.map((d) => ({ Día: d.day, Registros: d.registrations, Canjes: d.redemptions, Aguas: d.drinks })),
  );

  if (data.eventDays) {
    addSheet(
      'EventDays',
      data.eventDays.map((d) => ({ Día: d.label, Fecha: d.day, Registros: d.registrations, Canjes: d.redemptions, Aguas: d.drinks })),
    );
  }

  addSheet('ByZone', data.byZone.map((z) => ({ Zona: z.name, Registrados: z.count })));
  addSheet('ByPresbytery', data.byPresbytery.map((p) => ({ Presbiterio: p.name, Zona: p.zoneName, Registrados: p.count })));
  addSheet('TopChurches', data.topChurches.map((c) => ({ Iglesia: c.name, Presbiterio: c.presbyteryName, Registrados: c.count })));
  addSheet('Ages', data.ages.map((a) => ({ Rango: a.range ?? 'Sin dato', Registrados: a.count })));
  addSheet(
    'RedemptionsByStaff',
    data.redemptions.byStaff.map((s) => ({ Staff: s.name, Canjes: s.count, 'Último canje': s.lastAt })),
  );
  addSheet(
    'Batches',
    data.batches.map((b) => ({
      Lote: b.code,
      Kit: b.packageName,
      Estado: b.status,
      Total: b.total,
      Activas: b.active,
      'Sin reclamar': b.unclaimed,
      Deshabilitadas: b.invalidated,
    })),
  );
  addSheet(
    'Activity',
    data.activity.map((ac) => ({
      Fecha: ac.at,
      Tipo: ac.type,
      Asistente: ac.attendeeName,
      Edad: ac.ageRange ?? '',
      Iglesia: ac.churchName,
      Kit: ac.packageName,
      Staff: ac.staffName ?? '',
      Cantidad: ac.quantity ?? '',
    })),
  );
  if (data.alerts.length) {
    addSheet('Alerts', data.alerts.map((al) => ({ Nivel: al.level, Título: al.title, Detalle: al.detail })));
  }

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Uint8Array(out);
}

export type { DashboardErrorClass };

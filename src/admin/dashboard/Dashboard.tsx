import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Download, Info, OctagonAlert, RefreshCw } from 'lucide-react';
import AdminShell from '../AdminShell';
import { BATCH_STATUS_LABEL } from '../format';
import { api, ApiRequestError, dashboardExportUrl, downloadFile, XLSX_MIME } from '../../lib/api';
import UserAvatar from '../../components/UserAvatar';
import {
  EVENT_DAYS,
  type AdminAttendeesCatalog,
  type DashboardAlert,
  type DashboardFilters,
  type DashboardPeriod,
  type DashboardResponse,
} from '../../../shared/api';
import { BarList, Columns, Donut, Legend, Meter, SERIES, StackBar, kitColor } from './charts';
import ActivityFeed from './ActivityFeed';
import Pagination from '../../components/Pagination';
import { CardSkeleton, ChartSkeleton, ListSkeleton, Skeleton, SkeletonRegion } from '../../components/Skeleton';
import { usePagedList } from '../../lib/usePagedList';
import { dayLabel, fmtInt, fmtMoney, fmtPct, hourLabel, localDayOf, timeLabel } from './format';
import { useDashboard } from './useDashboard';
import s from './Dashboard.module.css';

/**
 * Admin → Dashboard (Etapa 7): centro de monitoreo operativo del congreso.
 *
 * Todos los números vienen de GET /api/admin/dashboard (server/dashboard.ts).
 * Las definiciones exactas de cada métrica y qué filtros respeta cada módulo
 * están en docs/CLAUDE_HANDOFF.md §34. Jerarquía:
 *   1 ¿Cómo vamos?  2 ¿Quién está llegando?  3 ¿Qué están consumiendo?
 *   4 ¿Quiénes son?  5 ¿Qué está pasando ahora?
 *
 * Los filtros viven en la URL (?periodo=&zona=&presbiterio=&iglesia=&kit=),
 * con los MISMOS nombres que Admin → Asistentes, así los enlaces a
 * Asistentes conservan zona/presbiterio/iglesia/kit.
 */

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  ...EVENT_DAYS.map((d) => ({ value: d.date as DashboardPeriod, label: d.label })),
];

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const rawPeriod = params.get('periodo') ?? 'all';
  const period = (PERIODS.some((p) => p.value === rawPeriod) ? rawPeriod : 'all') as DashboardPeriod;
  const zoneId = params.get('zona') ?? '';
  const presbyteryId = params.get('presbiterio') ?? '';
  const churchId = params.get('iglesia') ?? '';
  const packageId = params.get('kit') ?? '';

  const filters: DashboardFilters = useMemo(
    () => ({ period, zoneId, presbyteryId, churchId, packageId }),
    [period, zoneId, presbyteryId, churchId, packageId],
  );
  const { data, error, loading, updatedAt, refresh } = useDashboard(filters);

  const [catalog, setCatalog] = useState<AdminAttendeesCatalog | null>(null);
  useEffect(() => {
    api.attendeesCatalog().then(setCatalog).catch(() => {});
  }, []);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v && v !== 'all' ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };
  const hasFilters = period !== 'all' || Boolean(zoneId || presbyteryId || churchId || packageId);
  const geoFiltered = Boolean(zoneId || presbyteryId || churchId);

  // Etapa 4: exportación del Dashboard (PDF / Excel), respetando SIEMPRE los
  // filtros activos (misma `filters` que alimenta la pantalla). `exporting`
  // evita pedidos duplicados con doble clic; un error se muestra junto a los
  // botones y nunca descarga un archivo vacío/falso (downloadFile revisa el
  // content-type real de la respuesta antes de "guardar").
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState('');
  const runExport = async (format: 'pdf' | 'xlsx') => {
    if (exporting) return;
    setExporting(format);
    setExportError('');
    try {
      await downloadFile(
        dashboardExportUrl(format, filters),
        format === 'pdf' ? 'application/pdf' : XLSX_MIME,
        format === 'pdf' ? 'dashboard-arraigados.pdf' : 'dashboard-arraigados.xlsx',
      );
    } catch (err) {
      setExportError(err instanceof ApiRequestError ? err.message : 'No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setExporting(null);
    }
  };

  /** Enlace a Asistentes con los filtros actuales + el que se pide (el periodo no existe allá). */
  const attendeesLink = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    const base = { zona: zoneId, presbiterio: presbyteryId, iglesia: churchId, kit: packageId, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const qs = q.toString();
    return `/admin/asistentes${qs ? `?${qs}` : ''}`;
  };

  const presbyteries = useMemo(
    () => (catalog?.presbyteries ?? []).filter((p) => !zoneId || p.zoneId === zoneId),
    [catalog, zoneId],
  );
  const churches = useMemo(() => {
    const allowed = new Set(presbyteries.map((p) => p.id));
    return (catalog?.churches ?? []).filter((c) => (presbyteryId ? c.presbyteryId === presbyteryId : allowed.has(c.presbyteryId)));
  }, [catalog, presbyteries, presbyteryId]);

  const live = !error && Boolean(updatedAt);

  return (
    <AdminShell
      title="Dashboard"
      wide
      action={
        <div className={s.headRight}>
          <span className={`${s.live} ${live ? s.liveOn : s.liveOff}`}>
            <span className={s.liveDot} aria-hidden="true" />
            {live ? 'En vivo' : error ? 'Sin conexión' : 'Conectando…'}
          </span>
          <span className={s.updated} aria-live="polite">
            {updatedAt ? `Actualizado ${timeLabel(new Date(updatedAt).toISOString(), true)}` : ''}
          </span>
          <button type="button" className={s.refresh} onClick={refresh} disabled={loading} aria-label="Actualizar ahora">
            <RefreshCw size={15} className={loading ? s.spin : ''} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
        </div>
      }
    >
      <p className={s.kicker}>Arraigados 2K26 · Monitoreo del congreso</p>

      {/* ---------------- Filtros globales ---------------- */}
      <section className={s.filters} aria-label="Filtros del Dashboard">
        <Select label="Periodo" value={period} all={null} options={PERIODS.map((p) => ({ id: p.value, name: p.label }))} onChange={(v) => update({ periodo: v })} />
        <Select label="Zona" value={zoneId} options={catalog?.zones ?? []} onChange={(v) => update({ zona: v, presbiterio: '', iglesia: '' })} />
        <Select label="Presbiterio" value={presbyteryId} options={presbyteries} onChange={(v) => update({ presbiterio: v, iglesia: '' })} />
        <Select label="Iglesia" value={churchId} options={churches} onChange={(v) => update({ iglesia: v })} />
        <Select label="Kit" all="Todos" value={packageId} options={catalog?.packages ?? []} onChange={(v) => update({ kit: v })} />
        <div className={s.filterActions}>
          <button type="button" className={s.clear} disabled={!hasFilters} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Limpiar filtros
          </button>
          <button
            type="button"
            className={s.export}
            disabled={exporting !== null}
            onClick={() => void runExport('pdf')}
            title="Exportar el reporte actual (con estos filtros) en PDF"
          >
            <Download size={14} aria-hidden="true" /> {exporting === 'pdf' ? 'Generando PDF…' : 'Exportar PDF'}
          </button>
          <button
            type="button"
            className={s.export}
            disabled={exporting !== null}
            onClick={() => void runExport('xlsx')}
            title="Exportar el reporte actual (con estos filtros) en Excel"
          >
            <Download size={14} aria-hidden="true" /> {exporting === 'xlsx' ? 'Generando Excel…' : 'Exportar Excel'}
          </button>
          {exportError && <p className={s.exportError} role="alert">{exportError}</p>}
        </div>
      </section>

      {error && (
        <div className={s.errorBox} role="alert">
          <span>{data ? `No se pudo actualizar (${error}). Se muestran los datos de las ${timeLabel(data.generatedAt)}.` : error}</span>
          <button type="button" className={s.refresh} onClick={refresh}>
            Reintentar
          </button>
        </div>
      )}

      {!data && !error && <DashboardSkeleton />}

      {data && <Body d={data} geoFiltered={geoFiltered} periodFiltered={period !== 'all'} attendeesLink={attendeesLink} />}
    </AdminShell>
  );
}

/* ================================================================== */

function Body({
  d,
  geoFiltered,
  periodFiltered,
  attendeesLink,
}: {
  d: DashboardResponse;
  geoFiltered: boolean;
  periodFiltered: boolean;
  attendeesLink: (extra: Record<string, string>) => string;
}) {
  const nothingYet = d.pulses.total === 0 && d.registered === 0 && d.redemptions.count === 0;
  const kitIndex = new Map(d.kits.map((k, i) => [k.packageId, i]));
  // Los colores de kit se fijan por el orden de precio de TODOS los kits mostrados.
  const kitSegments = d.kits.map((k) => ({ key: k.packageId, label: k.name, value: k.count, color: kitColor(kitIndex.get(k.packageId) ?? 9) }));
  const kitTotal = d.kits.reduce((n, k) => n + k.count, 0);
  const drinksPct = d.drinks.included ? fmtPct(d.drinks.used, d.drinks.included) : '—';
  const focusLabel = d.focusDay === d.today ? 'hoy' : dayLabel(d.focusDay);
  const scopeNote = periodFiltered || geoFiltered ? 'con los filtros aplicados' : null;

  if (nothingYet) {
    return (
      <section className={s.emptyState}>
        <h2>Todavía no hay datos</h2>
        <p>
          Cuando se creen lotes de pulseras y los asistentes empiecen a registrarse, aquí aparecerán los registros, los kits,
          las aguas y la actividad en vivo.
        </p>
      </section>
    );
  }

  return (
    <>
      {d.alerts.length > 0 && <Alerts alerts={d.alerts} />}

      {/* ============ 1. ¿Cómo vamos? ============ */}
      <Level n={1} title="¿Cómo vamos?">
        <div className={s.kpis}>
          <Kpi label="Registrados" value={fmtInt(d.registered)} accent>
            {!periodFiltered && !geoFiltered && d.pulses.total > 0 ? (
              <p className={s.kpiSub}>
                {fmtPct(d.registered, d.pulses.total)} de {fmtInt(d.pulses.total)} pulseras impresas
              </p>
            ) : (
              <p className={s.kpiSub}>{scopeNote ? `Asistentes ${scopeNote}` : 'Asistentes con pulsera activa'}</p>
            )}
            <dl className={s.kpiFacts}>
              <div><dt>Reclamadas</dt><dd>{fmtInt(d.pulses.active)}</dd></div>
              <div><dt>Sin reclamar</dt><dd>{fmtInt(d.pulses.unclaimed)}</dd></div>
              <div><dt>Deshabilitadas</dt><dd>{fmtInt(d.pulses.invalidated)}</dd></div>
            </dl>
          </Kpi>

          <Kpi label="Registros de hoy" value={fmtInt(d.registeredToday)}>
            <p className={s.kpiSub}>
              <TodayDelta today={d.registeredToday} yesterday={d.registeredYesterday} />
            </p>
            <MiniTrend byDay={d.byDay} today={d.today} />
          </Kpi>

          <Kpi label="Aguas entregadas" value={fmtInt(d.drinks.used)} unit={d.drinks.included ? `/ ${fmtInt(d.drinks.included)}` : undefined}>
            {d.drinks.included > 0 ? (
              <>
                <Meter value={d.drinks.used} max={d.drinks.included} color={SERIES.drinks} label="Aguas canjeadas de las incluidas" />
                <p className={s.kpiSub}>
                  {drinksPct} consumido · {fmtInt(d.drinks.remaining)} restantes
                </p>
              </>
            ) : (
              <p className={s.kpiSub}>{d.registered ? 'Los kits registrados no incluyen aguas.' : 'Sin registrados con estos filtros.'}</p>
            )}
          </Kpi>

          <Kpi label="Kits" value={fmtInt(kitTotal)} unit="asignados">
            <StackBar segments={kitSegments} label="Distribución de kits" />
            <Legend
              items={d.kits.map((k) => ({
                key: k.packageId,
                color: kitColor(kitIndex.get(k.packageId) ?? 9),
                label: (
                  <span>
                    {k.name} <b>{fmtInt(k.count)}</b> <span className={s.muted}>{fmtPct(k.count, kitTotal)}</span>
                  </span>
                ),
              }))}
            />
          </Kpi>

          <Kpi label="Valor estimado" value={fmtMoney(d.valueCents)}>
            <p className={s.kpiSub}>Precio de lista de los kits de los registrados.</p>
            <p className={s.disclaimer}>No representa pagos confirmados.</p>
          </Kpi>

          <Kpi label="Pulseras reclamadas" value={fmtInt(d.pulses.active)} unit={`/ ${fmtInt(d.pulses.total)}`}>
            <Meter value={d.pulses.active} max={d.pulses.total} label="Pulseras reclamadas de las impresas" />
            <p className={s.kpiSub}>
              {fmtPct(d.pulses.active, d.pulses.total)} de las pulseras impresas
              {d.pulses.unclaimed > 0 ? ` · ${fmtInt(d.pulses.unclaimed)} disponibles` : ''}
            </p>
          </Kpi>
        </div>
      </Level>

      {/* ============ 2. ¿Quién está llegando? ============ */}
      <Level n={2} title="¿Quién está llegando?">
        <div className={s.grid2}>
          <Card title="Registros por día" note="Todos los días · no usa el filtro de periodo">
            <Columns
              label="Registros por día"
              data={d.byDay.slice(-21).map((r) => ({
                key: r.day,
                label: dayLabel(r.day),
                value: r.registrations,
                tip: `${dayLabel(r.day, true)}: ${fmtInt(r.registrations)} registros`,
              }))}
              labelEvery={d.byDay.length > 10 ? 3 : 1}
            />
          </Card>

          <Card title={`Registros por hora · ${focusLabel}`} note="Hora de Tijuana">
            <Columns
              label={`Registros por hora (${focusLabel})`}
              data={d.byHour.map((h) => ({
                key: String(h.hour),
                label: hourLabel(h.hour).slice(0, 2),
                value: h.registrations,
                tip: `${hourLabel(h.hour)}–${hourLabel((h.hour + 1) % 24)}: ${fmtInt(h.registrations)}`,
              }))}
              labelEvery={3}
              empty={`Sin registros ${focusLabel}.`}
            />
            <div className={s.velocity}>
              <Stat label="Última hora" value={d.velocity.lastHour === null ? '—' : fmtInt(d.velocity.lastHour)} hint={d.velocity.lastHour === null ? 'Solo para hoy' : 'últimos 60 min'} />
              <Stat label="Promedio" value={d.velocity.avgPerHour === null ? '—' : String(d.velocity.avgPerHour)} hint={d.velocity.avgPerHour === null ? 'Sin datos suficientes' : 'registros por hora'} />
              <Stat label="Máximo" value={d.velocity.peak ? fmtInt(d.velocity.peak.count) : '—'} hint={d.velocity.peak ? `a las ${hourLabel(d.velocity.peak.hour)}` : 'Sin datos suficientes'} />
            </div>
          </Card>
        </div>

        <div className={s.grid3}>
          <Card title="Por presbiterio" note="Clic para ver sus asistentes">
            <BarList
              label="Registrados por presbiterio"
              total={d.registered}
              items={d.byPresbytery.map((p) => ({
                id: p.id,
                label: p.name,
                sub: p.zoneName,
                value: p.count,
                href: attendeesLink({ presbiterio: p.id, iglesia: '' }),
              }))}
            />
          </Card>
          <Card title="Por zona" note="Clic para ver sus asistentes">
            <BarList
              label="Registrados por zona"
              total={d.registered}
              items={d.byZone.map((z) => ({ id: z.id, label: z.name, value: z.count, href: attendeesLink({ zona: z.id, presbiterio: '', iglesia: '' }) }))}
            />
          </Card>
          <Card title="Top 10 iglesias" note="Clic para ver sus asistentes">
            <BarList
              ranked
              label="Diez iglesias con más registrados"
              items={d.topChurches.map((c) => ({ id: c.id, label: c.name, sub: c.presbyteryName, value: c.count, href: attendeesLink({ iglesia: c.id }) }))}
            />
          </Card>
        </div>
      </Level>

      {/* ============ 3. ¿Qué están consumiendo? ============ */}
      <Level n={3} title="¿Qué están consumiendo?">
        <div className={s.grid2}>
          <Card title="Distribución de kits">
            <div className={s.kitWrap}>
              <Donut
                segments={kitSegments}
                label={`Kits: ${d.kits.map((k) => `${k.name} ${k.count}`).join(', ')}`}
                center={
                  <>
                    <strong className={s.donutNum}>{fmtInt(kitTotal)}</strong>
                    <span className={s.donutLbl}>kits</span>
                  </>
                }
              />
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Kit</th>
                    <th className={s.r}>Cantidad</th>
                    <th className={s.r}>%</th>
                    <th className={s.r}>Valor asignado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.kits.map((k) => (
                    <tr key={k.packageId}>
                      <td>
                        <span className={s.swatch} style={{ background: kitColor(kitIndex.get(k.packageId) ?? 9) }} aria-hidden="true" />
                        {k.name}
                        <span className={s.tableSub}>{fmtMoney(k.price)} · {k.includedDrinks} aguas</span>
                      </td>
                      <td className={s.r}>{fmtInt(k.count)}</td>
                      <td className={s.r}>{fmtPct(k.count, kitTotal)}</td>
                      <td className={s.r}>{fmtMoney(k.valueCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className={s.r}>{fmtInt(kitTotal)}</td>
                    <td className={s.r}>{kitTotal ? '100%' : '0%'}</td>
                    <td className={s.r}>{fmtMoney(d.valueCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={s.disclaimer}>Valor asignado = cantidad × precio del kit en la base. No representa pagos confirmados.</p>
          </Card>

          <Card title="Aguas frescas">
            <div className={s.drinkStats}>
              <Stat label="Incluidas" value={fmtInt(d.drinks.included)} />
              <Stat label="Canjeadas" value={fmtInt(d.drinks.used)} />
              <Stat label="Disponibles" value={fmtInt(d.drinks.remaining)} />
              <Stat label="Consumido" value={drinksPct} />
            </div>
            <h3 className={s.subTitle}>Canjes por hora · {focusLabel}</h3>
            <Columns
              color={SERIES.drinks}
              label={`Aguas canjeadas por hora (${focusLabel})`}
              data={d.byHour.map((h) => ({
                key: String(h.hour),
                label: hourLabel(h.hour).slice(0, 2),
                value: h.redemptions,
                tip: `${hourLabel(h.hour)}–${hourLabel((h.hour + 1) % 24)}: ${fmtInt(h.redemptions)} aguas`,
              }))}
              labelEvery={3}
              height={120}
              empty={`Sin canjes ${focusLabel}.`}
            />
            <p className={s.note}>
              {periodFiltered ? 'En el periodo' : 'En total'}: {fmtInt(d.redemptions.drinks)} aguas en {fmtInt(d.redemptions.count)} canjes registrados.
            </p>
          </Card>
        </div>

        <Card title="Canjes por Staff" note={periodFiltered ? 'En el periodo elegido' : 'Desde el inicio'}>
          <BarList
            color={SERIES.drinks}
            label="Aguas canjeadas por cada Staff"
            total={d.redemptions.drinks}
            empty="Ningún Staff ha canjeado aguas todavía."
            items={d.redemptions.byStaff.map((u) => ({
              id: u.id,
              label: u.name,
              sub: `Último canje ${localDayOf(u.lastAt) === d.today ? 'hoy' : dayLabel(localDayOf(u.lastAt))} ${timeLabel(u.lastAt)}`,
              value: u.count,
              lead: <UserAvatar className={s.avatarSm} userId={u.id} name={u.name} />,
            }))}
          />
        </Card>
      </Level>

      {/* ============ 4. ¿Quiénes son? ============ */}
      <Level n={4} title="¿Quiénes son?">
        <div className={s.grid2}>
          <Card title="Edades" note="Rangos de edad del registro">
            <Columns
              label="Registrados por rango de edad"
              height={140}
              data={d.ages.map((a) => ({
                key: a.range ?? 'none',
                label: a.range ?? 'Sin dato',
                value: a.count,
                muted: a.range === null,
                tip: `${a.range ? `${a.range} años` : 'Sin dato'}: ${fmtInt(a.count)} (${fmtPct(a.count, d.registered)})`,
              }))}
            />
          </Card>
          <Card title="Representación">
            <div className={s.coverage}>
              <Stat label="Iglesias" value={fmtInt(d.coverage.churches)} hint="con al menos un registrado" />
              <Stat label="Presbiterios" value={fmtInt(d.coverage.presbyteries)} hint="con al menos un registrado" />
              <Stat label="Zonas" value={fmtInt(d.coverage.zones)} hint="con al menos un registrado" />
            </div>
            <p className={s.note}>El detalle por zona, presbiterio e iglesia está en «¿Quién está llegando?».</p>
          </Card>
        </div>
      </Level>

      {/* ============ 5. ¿Qué está pasando ahora? ============ */}
      <Level n={5} title="¿Qué está pasando ahora?">
        <div className={s.grid2}>
          <Card title="Actividad reciente">
            <ActivityFeed items={d.activity} today={d.today} />
          </Card>
          <div className={s.stackCol}>
            {d.eventDays && (
              <Card title="Sábado vs Domingo">
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th />
                      {d.eventDays.map((e) => (
                        <th key={e.day} className={s.r}>{e.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Registros</td>{d.eventDays.map((e) => <td key={e.day} className={s.r}>{fmtInt(e.registrations)}</td>)}</tr>
                    <tr><td>Canjes</td>{d.eventDays.map((e) => <td key={e.day} className={s.r}>{fmtInt(e.redemptions)}</td>)}</tr>
                    <tr><td>Aguas</td>{d.eventDays.map((e) => <td key={e.day} className={s.r}>{fmtInt(e.drinks)}</td>)}</tr>
                  </tbody>
                </table>
              </Card>
            )}

            <Card title="Estado de pulseras" note={d.filters.packageId ? 'Solo el kit elegido' : 'Todas las impresas'}>
              <StackBar
                label="Pulseras por estado"
                segments={[
                  { key: 'a', label: 'Reclamadas', value: d.pulses.active, color: SERIES.primary },
                  { key: 'u', label: 'Sin reclamar', value: d.pulses.unclaimed, color: '#b9b2cc' },
                  { key: 'i', label: 'Deshabilitadas', value: d.pulses.invalidated, color: '#a1262c' },
                ]}
              />
              <div className={s.pulseStats}>
                <Stat label="Reclamadas" value={fmtInt(d.pulses.active)} hint={fmtPct(d.pulses.active, d.pulses.total)} />
                <Stat label="Sin reclamar" value={fmtInt(d.pulses.unclaimed)} hint={fmtPct(d.pulses.unclaimed, d.pulses.total)} />
                <Stat label="Deshabilitadas" value={fmtInt(d.pulses.invalidated)} hint="reemplazadas por otra" />
              </div>
            </Card>

            <BatchStatusCard batches={d.batches} kitFiltered={Boolean(d.filters.packageId)} />
          </div>
        </div>
      </Level>

      <p className={s.footer}>
        Datos calculados a las {timeLabel(d.generatedAt, true)} (hora de Tijuana) · se actualizan cada 60 s.
      </p>
    </>
  );
}

/* ================================================================== */

/** Estado de lotes: lista paginada en el navegador (10 por página; los lotes pueden crecer). */
function BatchStatusCard({ batches, kitFiltered }: { batches: DashboardResponse['batches']; kitFiltered: boolean }) {
  const paged = usePagedList(batches);
  return (
    <Card title="Estado de lotes" note={kitFiltered ? 'Solo el kit elegido' : undefined}>
      {batches.length === 0 ? (
        <p className={s.note}>No hay lotes.</p>
      ) : (
        <>
          <ul className={s.batches}>
            {paged.pageItems.map((b) => (
              <li key={b.id}>
                <Link className={s.batch} to={`/admin/lotes/${encodeURIComponent(b.id)}`}>
                  <span className={s.batchHead}>
                    <strong>{b.code}</strong>
                    <span className={`${s.batchStatus} ${s['bs_' + b.status]}`}>{BATCH_STATUS_LABEL[b.status] ?? b.status}</span>
                  </span>
                  <span className={s.batchMeta}>
                    {b.packageName} · {fmtInt(b.active)} reclamadas · {fmtInt(b.unclaimed)} sin reclamar de {fmtInt(b.total)}
                    {b.invalidated ? ` · ${b.invalidated} deshabilitadas` : ''}
                  </span>
                  <Meter value={b.active + b.invalidated} max={b.total} label={`${b.code}: usadas ${b.active + b.invalidated} de ${b.total}`} />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            label="lotes"
            page={paged.page}
            pageSize={paged.pageSize}
            total={paged.total}
            onPageChange={paged.setPage}
            onPageSizeChange={paged.setPageSize}
          />
        </>
      )}
    </Card>
  );
}

/**
 * Carga inicial (o filtros nuevos): la MISMA estructura del tablero con
 * esqueletos — nunca "0" ni gráficas vacías mientras llegan los datos.
 */
function DashboardSkeleton() {
  return (
    <SkeletonRegion label="Cargando datos del congreso…" className={s.skeletonStack}>
      <Level n={1} title="¿Cómo vamos?">
        <div className={s.kpis}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <CardSkeleton key={i} className={`${s.kpi} ${i === 0 ? s.kpiAccent : ''}`} lines={2} />
          ))}
        </div>
      </Level>
      <Level n={2} title="¿Quién está llegando?">
        <div className={s.grid2}>
          <SkeletonCard>
            <ChartSkeleton height={150} bars={7} />
          </SkeletonCard>
          <SkeletonCard>
            <ChartSkeleton height={150} bars={14} />
          </SkeletonCard>
        </div>
        <div className={s.grid3}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i}>
              <ListSkeleton rows={5} avatar={false} />
            </SkeletonCard>
          ))}
        </div>
      </Level>
      <Level n={3} title="¿Qué están consumiendo?">
        <div className={s.grid2}>
          <SkeletonCard>
            <div className={s.kitWrap}>
              <Skeleton w={168} h={168} r="50%" />
              <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} h={14} />
                ))}
              </div>
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <ChartSkeleton height={120} bars={14} />
          </SkeletonCard>
        </div>
      </Level>
      <Level n={4} title="¿Quiénes son?">
        <div className={s.grid2}>
          <SkeletonCard>
            <ChartSkeleton height={140} bars={8} />
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton h={70} r={12} />
          </SkeletonCard>
        </div>
      </Level>
      <Level n={5} title="¿Qué está pasando ahora?">
        <div className={s.grid2}>
          <SkeletonCard>
            <ListSkeleton rows={6} />
          </SkeletonCard>
          <SkeletonCard>
            <ListSkeleton rows={4} avatar={false} />
          </SkeletonCard>
        </div>
      </Level>
    </SkeletonRegion>
  );
}

function SkeletonCard({ children }: { children: ReactNode }) {
  return (
    <section className={s.card} aria-hidden="true">
      <Skeleton w="45%" h={16} />
      {children}
    </section>
  );
}

function Level({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className={s.level} aria-labelledby={`lvl-${n}`}>
      <h2 id={`lvl-${n}`} className={s.levelTitle}>
        <span className={s.levelNum}>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{title}</h3>
        {note && <span className={s.cardNote}>{note}</span>}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, unit, accent, children }: { label: string; value: string; unit?: string; accent?: boolean; children?: ReactNode }) {
  return (
    <article className={`${s.kpi} ${accent ? s.kpiAccent : ''}`}>
      <h3 className={s.kpiLabel}>{label}</h3>
      <p className={s.kpiValue}>
        {value}
        {unit && <span className={s.kpiUnit}> {unit}</span>}
      </p>
      {children}
    </article>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <strong className={s.statValue}>{value}</strong>
      {hint && <span className={s.statHint}>{hint}</span>}
    </div>
  );
}

function TodayDelta({ today, yesterday }: { today: number; yesterday: number }) {
  if (!yesterday) return <>{today ? 'Ayer no hubo registros' : 'Sin registros hoy todavía'}</>;
  const diff = today - yesterday;
  const pct = Math.round((Math.abs(diff) / yesterday) * 100);
  if (diff === 0) return <>Igual que ayer ({fmtInt(yesterday)})</>;
  return (
    <>
      <span className={diff > 0 ? s.up : s.down}>
        {diff > 0 ? '▲' : '▼'} {pct}%
      </span>{' '}
      vs ayer ({fmtInt(yesterday)})
    </>
  );
}

/** Tendencia de los últimos 7 días (hoy resaltado). Sin ejes: es contexto, el detalle está en Nivel 2. */
function MiniTrend({ byDay, today }: { byDay: DashboardResponse['byDay']; today: string }) {
  const days: string[] = [];
  const base = new Date(`${today}T12:00:00Z`);
  for (let i = 6; i >= 0; i--) days.push(new Date(base.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  const map = new Map(byDay.map((r) => [r.day, r.registrations]));
  const values = days.map((d) => map.get(d) ?? 0);
  const max = Math.max(...values, 1);
  if (values.every((v) => v === 0)) return null;
  return (
    <div className={s.spark} role="img" aria-label={`Registros de los últimos 7 días: ${values.join(', ')}`}>
      {days.map((d, i) => (
        <span key={d} className={s.sparkCol} title={`${dayLabel(d)}: ${values[i]}`}>
          <span className={`${s.sparkBar} ${d === today ? s.sparkToday : ''}`} style={{ height: `${Math.max((values[i] / max) * 100, values[i] ? 6 : 0)}%` }} />
        </span>
      ))}
    </div>
  );
}

const ALERT_ICON = { critical: OctagonAlert, warning: AlertTriangle, info: Info } as const;
const ALERT_LABEL = { critical: 'Crítico', warning: 'Atención', info: 'Aviso' } as const;

function Alerts({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section className={s.alerts} aria-label="Alertas operativas">
      {alerts.map((a) => {
        const Icon = ALERT_ICON[a.level];
        return (
          <div key={a.id} className={`${s.alert} ${s['al_' + a.level]}`}>
            <Icon size={17} aria-hidden="true" />
            <div>
              <strong>
                <span className={s.alertLevel}>{ALERT_LABEL[a.level]}:</span> {a.title}
              </strong>
              <span>{a.detail}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Select({
  label,
  all = 'Todas',
  value,
  options,
  onChange,
}: {
  label: string;
  all?: string | null;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={s.select}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== null && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

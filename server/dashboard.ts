import { query } from './db';
import {
  AGE_RANGES,
  DASHBOARD_DAY_RE,
  DASHBOARD_THRESHOLDS as T,
  EVENT_DAYS,
  EVENT_TIMEZONE,
  type BatchStatus,
  type DashboardActivity,
  type DashboardAlert,
  type DashboardFilters,
  type DashboardPeriod,
  type DashboardResponse,
} from '../shared/api';

/**
 * Etapa 7 — Dashboard operativo (solo Admin, solo lectura).
 *
 * Lee las MISMAS tablas que el resto del panel; no escribe nada y no cambia
 * el esquema. Las definiciones exactas de cada métrica están en
 * docs/CLAUDE_HANDOFF.md §34.3. Lo esencial:
 *
 * - "Población" = asistentes con pulsera ACTIVE (igual que Admin → Asistentes,
 *   así los números coinciden con esa lista). Kit, valor y saldo de aguas
 *   salen de ESA pulsera (índice único: una ACTIVE por asistente).
 * - Momento del registro = "Attendee"."createdAt" (el claim crea el asistente
 *   y reclama la pulsera en la misma transacción). No se usa "Pulse"."claimedAt"
 *   porque un reemplazo de pulsera lo vuelve a escribir.
 * - Canjes = filas de "Redemption" (cada canje de Staff deja una).
 * - Todas las fechas de Neon están en UTC sin zona: se convierten a
 *   America/Tijuana antes de agrupar por día u hora.
 *
 * Filtros: ver `buildFilters`. Pulseras y lotes solo respetan el kit (una
 * pulsera sin reclamar no tiene iglesia). Las alertas son globales: no
 * cambian con los filtros.
 */

export class DashboardError extends Error {}

const TZ = EVENT_TIMEZONE; // constante del código, nunca entrada del usuario
/** Timestamp UTC sin zona (como lo guarda Prisma) → timestamp local de Tijuana. */
const local = (col: string) => `((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`;
const localDay = (col: string) => `(${local(col)})::date`;
const iso = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Valida la query string. Un filtro con formato inválido es error 400 (no se ignora en silencio). */
export function parseFilters(s: URLSearchParams): Required<DashboardFilters> {
  const id = (name: keyof DashboardFilters) => {
    const v = (s.get(name) ?? '').trim();
    if (v && !ID_RE.test(v)) throw new DashboardError(`Filtro inválido: ${name}.`);
    return v;
  };
  const rawPeriod = (s.get('period') ?? 'all').trim() || 'all';
  if (!['all', 'today', 'yesterday'].includes(rawPeriod)) {
    if (!DASHBOARD_DAY_RE.test(rawPeriod) || Number.isNaN(Date.parse(`${rawPeriod}T00:00:00Z`))) {
      throw new DashboardError('Periodo inválido.');
    }
  }
  return {
    period: rawPeriod as DashboardPeriod,
    zoneId: id('zoneId'),
    presbyteryId: id('presbyteryId'),
    churchId: id('churchId'),
    packageId: id('packageId'),
  };
}

/**
 * Arma los WHERE de los filtros de zona/presbiterio/iglesia/kit sobre los
 * alias estándar (a = Attendee, c = Church, pr = Presbytery, z = Zone) y la
 * columna de kit que corresponda (p."packageId" o r."packageId").
 * Los valores van SIEMPRE como parámetros ($n).
 */
function geoKit(f: Required<DashboardFilters>, params: unknown[], kitCol: string): string[] {
  const where: string[] = [];
  const add = (sql: (n: number) => string, v: string) => {
    params.push(v);
    where.push(sql(params.length));
  };
  if (f.zoneId) add((n) => `z.id = $${n}`, f.zoneId);
  if (f.presbyteryId) add((n) => `pr.id = $${n}`, f.presbyteryId);
  if (f.churchId) add((n) => `c.id = $${n}`, f.churchId);
  if (f.packageId) add((n) => `${kitCol} = $${n}`, f.packageId);
  return where;
}

/** Condición SQL del periodo sobre una columna de fecha (o 'TRUE' si es "todo"). */
function periodCond(day: string | null, col: string, params: unknown[]): string {
  if (!day) return 'TRUE';
  params.push(day);
  return `${localDay(col)} = $${params.length}::date`;
}

/** Población: asistentes con pulsera ACTIVE (mismo FROM que server/attendees.ts). */
const POP_FROM = `
  FROM "Attendee" a
  JOIN "Pulse" p ON p."attendeeId" = a.id AND p.status = 'ACTIVE'
  JOIN "Package" k ON k.id = p."packageId"
  JOIN "Church" c ON c.id = a."churchId"
  JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
  JOIN "Zone" z ON z.id = pr."zoneId"`;

/** Canjes con la geografía del asistente y el kit del canje. */
const RED_FROM = `
  FROM "Redemption" r
  JOIN "Attendee" a ON a.id = r."attendeeId"
  JOIN "Package" k ON k.id = r."packageId"
  JOIN "Church" c ON c.id = a."churchId"
  JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
  JOIN "Zone" z ON z.id = pr."zoneId"`;

const whereSql = (parts: string[]) => (parts.length ? `WHERE ${parts.join(' AND ')}` : '');

/** Mismo criterio que la pantalla de Asistentes: si no hay rango, se deriva de la edad vieja ("age"). */
const AGE_RANGE_SQL = `COALESCE(a."ageRange", CASE
    WHEN a.age BETWEEN 16 AND 18 THEN '16-18'
    WHEN a.age BETWEEN 19 AND 21 THEN '19-21'
    WHEN a.age BETWEEN 22 AND 24 THEN '22-24'
    WHEN a.age BETWEEN 25 AND 27 THEN '25-27'
    WHEN a.age BETWEEN 28 AND 30 THEN '28-30'
    WHEN a.age BETWEEN 31 AND 34 THEN '31-34'
    WHEN a.age >= 35 THEN '35+'
  END)`;

export async function getDashboard(f: Required<DashboardFilters>): Promise<DashboardResponse> {
  /* --- Fechas de referencia (las da la base, no el reloj de la función) --- */
  const clock = (
    await query<{ today: string; yesterday: string; hour: number; nowIso: string }>(
      `SELECT to_char((now() AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS today,
              to_char((now() AT TIME ZONE '${TZ}')::date - 1, 'YYYY-MM-DD') AS yesterday,
              extract(hour FROM now() AT TIME ZONE '${TZ}')::int AS hour,
              to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "nowIso"`,
    )
  ).rows[0];

  const periodDay =
    f.period === 'all' ? null : f.period === 'today' ? clock.today : f.period === 'yesterday' ? clock.yesterday : f.period;
  const focusDay = periodDay ?? clock.today;
  const focusIsToday = focusDay === clock.today;

  /* --- Consultas (en paralelo; el pool tiene 3 conexiones) --- */

  // 1. Resumen de la población: periodo (FILTER), hoy y ayer.
  const summary = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'p."packageId"');
    const per = periodCond(periodDay, 'a."createdAt"', params);
    params.push(clock.today, clock.yesterday);
    const [tIdx, yIdx] = [params.length - 1, params.length];
    return query<{
      registered: number;
      valueCents: string | null;
      included: string | null;
      used: string | null;
      remaining: string | null;
      today: number;
      yesterday: number;
      churches: number;
      presbyteries: number;
      zones: number;
    }>(
      `SELECT count(*) FILTER (WHERE ${per})::int AS registered,
              sum(k.price) FILTER (WHERE ${per}) AS "valueCents",
              sum(k."includedDrinks") FILTER (WHERE ${per}) AS included,
              sum(LEAST(p."drinksUsed", k."includedDrinks")) FILTER (WHERE ${per}) AS used,
              sum(GREATEST(k."includedDrinks" - p."drinksUsed", 0)) FILTER (WHERE ${per}) AS remaining,
              count(*) FILTER (WHERE ${localDay('a."createdAt"')} = $${tIdx}::date)::int AS today,
              count(*) FILTER (WHERE ${localDay('a."createdAt"')} = $${yIdx}::date)::int AS yesterday,
              count(DISTINCT c.id) FILTER (WHERE ${per})::int AS churches,
              count(DISTINCT pr.id) FILTER (WHERE ${per})::int AS presbyteries,
              count(DISTINCT z.id) FILTER (WHERE ${per})::int AS zones
         ${POP_FROM} ${whereSql(where)}`,
      params,
    );
  })();

  // Agrupaciones de la población en el periodo (kit, zona, presbiterio, iglesia, edad).
  const popGroup = <R extends Record<string, unknown>>(select: string, group: string, order: string, limit = '') => {
    type Row = R & { count: number };
    const params: unknown[] = [];
    const where = geoKit(f, params, 'p."packageId"');
    where.push(periodCond(periodDay, 'a."createdAt"', params));
    return query<Row>(`SELECT ${select}, count(*)::int AS count ${POP_FROM} ${whereSql(where)} GROUP BY ${group} ORDER BY ${order} ${limit}`, params);
  };

  const kitsQ = popGroup<{ packageId: string; count: number }>(`p."packageId" AS "packageId"`, `p."packageId"`, `count DESC`);
  const packagesQ = query<{ id: string; name: string; price: number; includedDrinks: number; active: boolean }>(
    `SELECT id, name, price, "includedDrinks", active FROM "Package" ORDER BY price ASC, name ASC`,
  );
  const zoneQ = popGroup<{ id: string; name: string }>(`z.id, z.name`, `z.id, z.name`, `count DESC, z.name ASC`);
  const presbQ = popGroup<{ id: string; name: string; zoneName: string }>(
    `pr.id, pr.name, z.name AS "zoneName"`,
    `pr.id, pr.name, z.name`,
    `count DESC, pr.name ASC`,
  );
  const churchQ = popGroup<{ id: string; name: string; presbyteryName: string }>(
    `c.id, c.name, pr.name AS "presbyteryName"`,
    `c.id, c.name, pr.name`,
    `count DESC, c.name ASC`,
    'LIMIT 10',
  );
  const ageQ = popGroup<{ range: string | null }>(`${AGE_RANGE_SQL} AS range`, `1`, `1`);

  // Registros por día (todos los días; sin periodo) y por hora del día foco.
  const regDayQ = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'p."packageId"');
    return query<{ day: string; count: number }>(
      `SELECT to_char(${localDay('a."createdAt"')}, 'YYYY-MM-DD') AS day, count(*)::int AS count
         ${POP_FROM} ${whereSql(where)} GROUP BY 1 ORDER BY 1`,
      params,
    );
  })();
  const regHourQ = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'p."packageId"');
    where.push(periodCond(focusDay, 'a."createdAt"', params));
    return query<{ hour: number; count: number }>(
      `SELECT extract(hour FROM ${local('a."createdAt"')})::int AS hour, count(*)::int AS count
         ${POP_FROM} ${whereSql(where)} GROUP BY 1`,
      params,
    );
  })();
  const lastHourQ = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'p."packageId"');
    where.push(`a."createdAt" >= (now() AT TIME ZONE 'utc') - interval '1 hour'`);
    return query<{ n: number }>(`SELECT count(*)::int AS n ${POP_FROM} ${whereSql(where)}`, params);
  })();

  // Canjes: resumen del periodo + por Staff, por día y por hora del día foco.
  const redSummaryQ = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'r."packageId"');
    where.push(periodCond(periodDay, 'r."createdAt"', params));
    return query<{ count: number; drinks: number }>(
      `SELECT count(*)::int AS count, COALESCE(sum(r.quantity), 0)::int AS drinks ${RED_FROM} ${whereSql(where)}`,
      params,
    );
  })();
  const byStaffQ = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'r."packageId"');
    where.push(periodCond(periodDay, 'r."createdAt"', params));
    return query<{ id: string; name: string; count: number; lastAt: string }>(
      `SELECT u.id, u.name, COALESCE(sum(r.quantity), 0)::int AS count, ${iso('max(r."createdAt")')} AS "lastAt"
         ${RED_FROM} JOIN "User" u ON u.id = r."createdById"
         ${whereSql(where)} GROUP BY u.id, u.name ORDER BY count DESC, u.name ASC`,
      params,
    );
  })();
  const redDayQ = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'r."packageId"');
    return query<{ day: string; count: number; drinks: number }>(
      `SELECT to_char(${localDay('r."createdAt"')}, 'YYYY-MM-DD') AS day, count(*)::int AS count,
              COALESCE(sum(r.quantity), 0)::int AS drinks
         ${RED_FROM} ${whereSql(where)} GROUP BY 1 ORDER BY 1`,
      params,
    );
  })();
  const redHourQ = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'r."packageId"');
    where.push(periodCond(focusDay, 'r."createdAt"', params));
    return query<{ hour: number; count: number }>(
      `SELECT extract(hour FROM ${local('r."createdAt"')})::int AS hour, COALESCE(sum(r.quantity), 0)::int AS count
         ${RED_FROM} ${whereSql(where)} GROUP BY 1`,
      params,
    );
  })();

  // Pulseras y lotes: SIN filtros en SQL (se filtran por kit en JS; las alertas los necesitan completos).
  const pulsesQ = query<{ packageId: string; status: string; count: number }>(
    `SELECT "packageId", status::text AS status, count(*)::int AS count FROM "Pulse" GROUP BY 1, 2`,
  );
  const batchesQ = query<DashboardResponse['batches'][number] & { createdAt: string }>(
    `SELECT b.id, b.code, b.status, b."packageId", k.name AS "packageName",
            count(p.id)::int AS total,
            count(p.id) FILTER (WHERE p.status = 'ACTIVE')::int AS active,
            count(p.id) FILTER (WHERE p.status = 'UNCLAIMED')::int AS unclaimed,
            count(p.id) FILTER (WHERE p.status = 'INVALIDATED')::int AS invalidated,
            ${iso('b."createdAt"')} AS "createdAt"
       FROM "Batch" b
       JOIN "Package" k ON k.id = b."packageId"
       LEFT JOIN "Pulse" p ON p."batchId" = b.id
      GROUP BY b.id, b.code, b.status, b."packageId", k.name, b."createdAt"
      ORDER BY b."createdAt" DESC, b.code DESC`,
  );

  // Saldo global de aguas y última actividad (para las alertas; sin filtros).
  const globalQ = query<{ included: string | null; used: string | null; lastReg: string | null; lastRed: string | null }>(
    `SELECT (SELECT sum(k."includedDrinks") FROM "Pulse" p JOIN "Package" k ON k.id = p."packageId" WHERE p.status = 'ACTIVE') AS included,
            (SELECT sum(LEAST(p."drinksUsed", k."includedDrinks")) FROM "Pulse" p JOIN "Package" k ON k.id = p."packageId" WHERE p.status = 'ACTIVE') AS used,
            (SELECT ${iso('max("createdAt")')} FROM "Attendee") AS "lastReg",
            (SELECT ${iso('max("createdAt")')} FROM "Redemption") AS "lastRed"`,
  );

  const activityQ = recentActivity(f, periodDay);

  const [
    s,
    kits,
    packages,
    zones,
    presbs,
    churches,
    ages,
    regDay,
    regHour,
    lastHour,
    redSummary,
    byStaff,
    redDay,
    redHour,
    pulses,
    batches,
    global,
    activity,
  ] = await Promise.all([
    summary,
    kitsQ,
    packagesQ,
    zoneQ,
    presbQ,
    churchQ,
    ageQ,
    regDayQ,
    regHourQ,
    lastHourQ,
    redSummaryQ,
    byStaffQ,
    redDayQ,
    redHourQ,
    pulsesQ,
    batchesQ,
    globalQ,
    activityQ,
  ]);

  const sum = s.rows[0];
  const num = (v: string | number | null | undefined) => Number(v ?? 0);

  /* --- Kits: todos los paquetes (con 0 si no hay registrados), en orden de precio --- */
  const kitCount = new Map(kits.rows.map((r) => [r.packageId, r.count]));
  const kitRows = packages.rows
    .filter((k) => (f.packageId ? k.id === f.packageId : k.active || kitCount.has(k.id)))
    .map((k) => {
      const count = kitCount.get(k.id) ?? 0;
      return { packageId: k.id, name: k.name, price: k.price, includedDrinks: k.includedDrinks, count, valueCents: count * k.price };
    });

  /* --- Pulseras (filtro de kit en JS) --- */
  const pulseTotals = { total: 0, active: 0, unclaimed: 0, invalidated: 0 };
  for (const r of pulses.rows) {
    if (f.packageId && r.packageId !== f.packageId) continue;
    pulseTotals.total += r.count;
    if (r.status === 'ACTIVE') pulseTotals.active += r.count;
    if (r.status === 'UNCLAIMED') pulseTotals.unclaimed += r.count;
    if (r.status === 'INVALIDATED') pulseTotals.invalidated += r.count;
  }

  /* --- Por día (registros + canjes) --- */
  const dayMap = new Map<string, { day: string; registrations: number; redemptions: number; drinks: number }>();
  const dayRow = (day: string) => {
    let row = dayMap.get(day);
    if (!row) dayMap.set(day, (row = { day, registrations: 0, redemptions: 0, drinks: 0 }));
    return row;
  };
  for (const r of regDay.rows) dayRow(r.day).registrations = r.count;
  for (const r of redDay.rows) Object.assign(dayRow(r.day), { redemptions: r.count, drinks: r.drinks });
  const byDay = [...dayMap.values()].sort((x, y) => x.day.localeCompare(y.day));

  /* --- Por hora del día foco + velocidad --- */
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, registrations: 0, redemptions: 0 }));
  for (const r of regHour.rows) byHour[r.hour].registrations = r.count;
  for (const r of redHour.rows) byHour[r.hour].redemptions = r.count;
  const regHours = byHour.filter((h) => h.registrations > 0);
  const focusTotal = regHours.reduce((n, h) => n + h.registrations, 0);
  let avgPerHour: number | null = null;
  if (focusTotal >= 2) {
    const first = regHours[0].hour;
    const last = focusIsToday ? clock.hour : regHours[regHours.length - 1].hour;
    const span = Math.max(1, last - first + 1);
    avgPerHour = Math.round((focusTotal / span) * 10) / 10;
  }
  const peak = regHours.length
    ? regHours.reduce((best, h) => (h.registrations > best.registrations ? h : best))
    : null;

  /* --- Edades en el orden oficial --- */
  const ageMap = new Map(ages.rows.map((r) => [r.range, r.count]));
  const ageRows: DashboardResponse['ages'] = AGE_RANGES.map((range) => ({ range, count: ageMap.get(range) ?? 0 }));
  const unknownAges = ageMap.get(null) ?? 0;
  if (unknownAges) ageRows.push({ range: null, count: unknownAges });

  /* --- Comparativa por día del congreso --- */
  const eventDays = EVENT_DAYS.map(({ date, label }) => {
    const d = dayMap.get(date);
    return { day: date, label, registrations: d?.registrations ?? 0, redemptions: d?.redemptions ?? 0, drinks: d?.drinks ?? 0 };
  });
  const anyEventData = eventDays.some((d) => d.registrations || d.redemptions);

  const batchRows = batches.rows
    .filter((b) => !f.packageId || b.packageId === f.packageId)
    .map(({ createdAt: _omit, ...b }) => ({ ...b, status: b.status as BatchStatus }));

  return {
    generatedAt: clock.nowIso,
    today: clock.today,
    yesterday: clock.yesterday,
    focusDay,
    filters: f,
    registered: sum.registered,
    registeredToday: sum.today,
    registeredYesterday: sum.yesterday,
    valueCents: num(sum.valueCents),
    drinks: { included: num(sum.included), used: num(sum.used), remaining: num(sum.remaining) },
    kits: kitRows,
    coverage: { churches: sum.churches, presbyteries: sum.presbyteries, zones: sum.zones },
    pulses: pulseTotals,
    byDay,
    byHour,
    velocity: {
      lastHour: focusIsToday ? lastHour.rows[0].n : null,
      avgPerHour,
      peak: peak ? { hour: peak.hour, count: peak.registrations } : null,
    },
    byZone: zones.rows,
    byPresbytery: presbs.rows,
    topChurches: churches.rows,
    ages: ageRows,
    redemptions: { count: redSummary.rows[0].count, drinks: redSummary.rows[0].drinks, byStaff: byStaff.rows },
    eventDays: anyEventData ? eventDays : null,
    batches: batchRows,
    activity,
    alerts: buildAlerts({
      today: clock.today,
      hour: clock.hour,
      nowIso: clock.nowIso,
      drinksIncluded: num(global.rows[0].included),
      drinksUsed: num(global.rows[0].used),
      lastActivity: [global.rows[0].lastReg, global.rows[0].lastRed].filter(Boolean).sort().pop() ?? null,
      batches: batches.rows,
      pulses: pulses.rows,
      packages: packages.rows,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Actividad reciente                                                   */
/* ------------------------------------------------------------------ */

const ACTIVITY_PER_TYPE = 25;

/**
 * Feed: registros ("Attendee"), canjes ("Redemption") y reemplazos de
 * pulsera ("AuditLog" action = 'pulse.reassign', la única acción operativa
 * que ya se audita). Hasta 25 de cada tipo, mezclados por fecha. Respeta
 * todos los filtros. No se crea una tabla de actividad nueva.
 */
async function recentActivity(f: Required<DashboardFilters>, periodDay: string | null): Promise<DashboardActivity[]> {
  const regs = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'p."packageId"');
    where.push(periodCond(periodDay, 'a."createdAt"', params));
    return query<DashboardActivity>(
      `SELECT 'registration' AS type, a.id, ${iso('a."createdAt"')} AS at, a.id AS "attendeeId",
              a."fullName" AS "attendeeName", ${AGE_RANGE_SQL} AS "ageRange", c.name AS "churchName",
              k.name AS "packageName", NULL AS "staffId", NULL AS "staffName", NULL::int AS quantity
         ${POP_FROM} ${whereSql(where)}
        ORDER BY a."createdAt" DESC LIMIT ${ACTIVITY_PER_TYPE}`,
      params,
    );
  })();
  const reds = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'r."packageId"');
    where.push(periodCond(periodDay, 'r."createdAt"', params));
    return query<DashboardActivity>(
      `SELECT 'redemption' AS type, r.id, ${iso('r."createdAt"')} AS at, a.id AS "attendeeId",
              a."fullName" AS "attendeeName", ${AGE_RANGE_SQL} AS "ageRange", c.name AS "churchName",
              k.name AS "packageName", u.id AS "staffId", u.name AS "staffName", r.quantity
         ${RED_FROM} LEFT JOIN "User" u ON u.id = r."createdById" ${whereSql(where)}
        ORDER BY r."createdAt" DESC LIMIT ${ACTIVITY_PER_TYPE}`,
      params,
    );
  })();
  const reassigns = (() => {
    const params: unknown[] = [];
    const where = geoKit(f, params, 'np."packageId"');
    where.push(`l.action = 'pulse.reassign'`);
    where.push(periodCond(periodDay, 'l."createdAt"', params));
    return query<DashboardActivity>(
      `SELECT 'reassign' AS type, l.id, ${iso('l."createdAt"')} AS at, a.id AS "attendeeId",
              a."fullName" AS "attendeeName", ${AGE_RANGE_SQL} AS "ageRange", c.name AS "churchName",
              k.name AS "packageName", u.id AS "staffId", u.name AS "staffName", NULL::int AS quantity
         FROM "AuditLog" l
         JOIN "Pulse" np ON np.id = l."entityId"
         JOIN "Attendee" a ON a.id = np."attendeeId"
         JOIN "Package" k ON k.id = np."packageId"
         JOIN "Church" c ON c.id = a."churchId"
         JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
         JOIN "Zone" z ON z.id = pr."zoneId"
         LEFT JOIN "User" u ON u.id = l."actorId"
        ${whereSql(where)}
        ORDER BY l."createdAt" DESC LIMIT 10`,
      params,
    );
  })();
  const [a, b, c] = await Promise.all([regs, reds, reassigns]);
  return [...a.rows, ...b.rows, ...c.rows].sort((x, y) => y.at.localeCompare(x.at));
}

/* ------------------------------------------------------------------ */
/* Alertas operativas (umbrales en shared/api.ts DASHBOARD_THRESHOLDS)  */
/* ------------------------------------------------------------------ */

function buildAlerts(d: {
  today: string;
  hour: number;
  nowIso: string;
  drinksIncluded: number;
  drinksUsed: number;
  lastActivity: string | null;
  batches: { code: string; status: string; packageName: string; total: number; unclaimed: number }[];
  pulses: { packageId: string; status: string; count: number }[];
  packages: { id: string; name: string }[];
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  // 1. Consumo de aguas (global).
  if (d.drinksIncluded > 0) {
    const pct = Math.round((d.drinksUsed / d.drinksIncluded) * 100);
    if (pct >= T.drinksWarnPct) {
      alerts.push({
        id: 'drinks',
        level: pct >= T.drinksCriticalPct ? 'critical' : 'warning',
        title: `Aguas al ${pct}%`,
        detail: `Se han canjeado ${d.drinksUsed} de ${d.drinksIncluded} aguas incluidas en los kits de los registrados.`,
      });
    }
  }

  // 2. Lotes abiertos casi agotados.
  for (const b of d.batches) {
    if (b.status !== 'ABIERTO' || b.total < T.batchMinSize) continue;
    const pct = (b.unclaimed / b.total) * 100;
    if (b.unclaimed === 0) {
      alerts.push({ id: `batch-${b.code}`, level: 'info', title: `Lote ${b.code} sin pulseras libres`, detail: `Las ${b.total} pulseras (${b.packageName}) ya se reclamaron o se deshabilitaron.` });
    } else if (pct <= T.batchLowPct) {
      alerts.push({ id: `batch-${b.code}`, level: 'warning', title: `Lote ${b.code} casi agotado`, detail: `Quedan ${b.unclaimed} de ${b.total} pulseras sin reclamar (${b.packageName}).` });
    }
  }

  // 3. Existencias por kit.
  for (const k of d.packages) {
    const rows = d.pulses.filter((p) => p.packageId === k.id);
    const total = rows.reduce((n, r) => n + r.count, 0);
    if (total < T.kitMinSize) continue;
    const unclaimed = rows.find((r) => r.status === 'UNCLAIMED')?.count ?? 0;
    if ((unclaimed / total) * 100 <= T.kitLowPct) {
      alerts.push({
        id: `kit-${k.id}`,
        level: unclaimed === 0 ? 'critical' : 'warning',
        title: unclaimed === 0 ? `${k.name}: sin pulseras disponibles` : `${k.name}: quedan pocas pulseras`,
        detail: `${unclaimed} de ${total} pulseras de ${k.name} siguen sin reclamar.`,
      });
    }
  }

  // 4. Sin actividad en horario de operación de un día del congreso.
  const isEventDay = EVENT_DAYS.some((e) => e.date === d.today);
  const [from, to] = T.operatingHours;
  // Solo si ya hubo actividad HOY (al abrir el día no hay nada que comparar).
  const lastWasToday = d.lastActivity && new Date(d.lastActivity).toLocaleDateString('en-CA', { timeZone: TZ }) === d.today;
  if (isEventDay && d.hour >= from && d.hour < to && d.lastActivity && lastWasToday) {
    const minutes = Math.floor((Date.parse(d.nowIso) - Date.parse(d.lastActivity)) / 60_000);
    if (minutes >= T.idleMinutes) {
      alerts.push({
        id: 'idle',
        level: 'info',
        title: `Sin actividad desde hace ${minutes} min`,
        detail: 'No hay registros ni canjes recientes. Si hay asistentes llegando, revisa conexión y equipos de Staff.',
      });
    }
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

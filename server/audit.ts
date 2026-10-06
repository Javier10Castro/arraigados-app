import { NOW_UTC, query } from './db';
import { EVENT_TIMEZONE, parsePageSize } from '../shared/api';
import {
  AUDIT_ACTIONS,
  auditActionsOf,
  type AdminAuditFilters,
  type AdminAuditResponse,
  type AdminAuditRow,
  type AuditCategory,
} from '../shared/audit';

/**
 * Admin -> Auditoría (Etapa 8, 5 oct 2026). SOLO LECTURA sobre "AuditLog": no
 * escribe nada y no hay migración. Mismo esqueleto que Notas/Canjes (filtros,
 * orden y paginación en el SERVIDOR).
 *
 * "Sobre qué" (`entityName`) se resuelve con LEFT JOIN según `entityType`: cuenta,
 * asistente, lote, y -- para canjes, pulseras y notas -- el asistente dueño.
 * Si el registro ya no existe queda NULL y la pantalla muestra el id.
 */

const TZ = EVENT_TIMEZONE;
const local = (col: string) => `((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`;
const unaccent = (expr: string) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
const iso = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const CATEGORY_IDS: AuditCategory[] = ['usuarios', 'lotes', 'asistentes', 'pulseras', 'canjes', 'notas', 'avisos', 'ajustes', 'otros'];

const FROM = `
  FROM "AuditLog" al
  LEFT JOIN "User" actor ON actor.id = al."actorId"
  LEFT JOIN "User" tu ON al."entityType" = 'User' AND tu.id = al."entityId"
  LEFT JOIN "Attendee" ta ON al."entityType" = 'Attendee' AND ta.id = al."entityId"
  LEFT JOIN "Batch" tb ON al."entityType" = 'Batch' AND tb.id = al."entityId"
  LEFT JOIN "Redemption" tr ON al."entityType" = 'Redemption' AND tr.id = al."entityId"
  LEFT JOIN "Attendee" tra ON tra.id = tr."attendeeId"
  LEFT JOIN "Pulse" tp ON al."entityType" = 'Pulse' AND tp.id = al."entityId"
  LEFT JOIN "Attendee" tpa ON tpa.id = tp."attendeeId"
  LEFT JOIN "Note" tn ON al."entityType" = 'Note' AND tn.id = al."entityId"
  LEFT JOIN "Attendee" tna ON tna.id = tn."attendeeId"`;

const ENTITY_NAME = `COALESCE(tu."name", ta."fullName", tb."code", tra."fullName", tpa."fullName", tna."fullName")`;

type DbRow = Omit<AdminAuditRow, 'createdAt'> & { createdAt: string };

export async function listAudit(f: AdminAuditFilters): Promise<AdminAuditResponse> {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };

  const words = String(f.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const w of words) {
    add(
      (n) =>
        `(${[
          unaccent('actor."name"'),
          unaccent(ENTITY_NAME),
          unaccent('al."entityId"'),
          unaccent('al."action"'),
          unaccent('al."metadata"::text'),
        ]
          .map((c) => `${c} LIKE ${unaccent(`$${n}`)}`)
          .join(' OR ')})`,
      `%${w}%`,
    );
  }

  if (f.category && CATEGORY_IDS.includes(f.category)) {
    if (f.category === 'otros') {
      add((n) => `al."action" <> ALL($${n}::text[])`, Object.keys(AUDIT_ACTIONS));
    } else {
      add((n) => `al."action" = ANY($${n}::text[])`, auditActionsOf(f.category));
    }
  }
  if (f.actorId) add((n) => `al."actorId" = $${n}`, f.actorId);
  if (f.from) add((n) => `${local('al."createdAt"')} >= $${n}::date`, f.from);
  if (f.to) add((n) => `${local('al."createdAt"')} < ($${n}::date + 1)`, f.to);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await query<{ n: number }>(`SELECT count(*)::int AS n ${FROM} ${whereSql}`, params)).rows[0].n;
  const pageSize = parsePageSize(f.pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const page = Math.min(lastPage, Math.max(0, Math.floor(Number(f.page) || 0)));

  const { rows } = await query<DbRow>(
    `SELECT al.id, ${iso('al."createdAt"')} AS "createdAt", al."action", al."entityType", al."entityId",
            ${ENTITY_NAME} AS "entityName", al."actorId", actor."name" AS "actorName", al."metadata"
       ${FROM} ${whereSql}
      ORDER BY al."createdAt" DESC, al.id DESC
      LIMIT ${pageSize} OFFSET ${page * pageSize}`,
    params,
  );

  const summary = (
    await query<{ total: number; last24h: number; actors: number }>(
      `SELECT count(*)::int AS total,
              (count(*) FILTER (WHERE "createdAt" > ${NOW_UTC} - INTERVAL '24 hours'))::int AS last24h,
              count(DISTINCT "actorId")::int AS actors
         FROM "AuditLog"`,
    )
  ).rows[0];

  const actors = (
    await query<{ id: string; name: string }>(
      `SELECT u.id, u."name" FROM "User" u
        WHERE u.id IN (SELECT DISTINCT "actorId" FROM "AuditLog" WHERE "actorId" IS NOT NULL)
        ORDER BY u."name"`,
    )
  ).rows;

  // `fp` = huella de la contraseña (user.create / user.password_reset): no debe salir del servidor.
  for (const r of rows) {
    if (r.metadata && 'fp' in r.metadata) {
      const { fp: _fp, ...rest } = r.metadata;
      r.metadata = rest;
    }
  }

  return { total, page, pageSize, rows, summary, actors };
}

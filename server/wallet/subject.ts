/**
 * ¿De quién es la credencial? La identidad SIEMPRE sale de una credencial verificada en el servidor:
 *   · asistente: el token de su pulsera (cabecera x-pulse-token) -> su propia pulsera ACTIVA con asistente;
 *   · equipo (Staff/Admin): la cookie de sesión -> su propia pulsera vinculada (StaffPulse) y ACTIVA.
 * Ningún endpoint de Wallet acepta un id de pulsera, de asistente o de cuenta enviado por el cliente.
 */
import { query } from '../db';
import { QR_TOKEN_RE } from '../../shared/api';
import type { WalletSubject } from './event';

export type SubjectResult = { ok: true; subject: WalletSubject } | { ok: false; reason: 'not_found' | 'invalidated' | 'unclaimed' | 'no_pulse' };

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

type Row = { id: string; status: string; attendeeId: string | null; fullName: string | null; churchName: string | null };

const SELECT = `SELECT p.id, p.status::text AS status, p."attendeeId", a."fullName", c.name AS "churchName"
                  FROM "Pulse" p
                  LEFT JOIN "Attendee" a ON a.id = p."attendeeId"
                  LEFT JOIN "Church" c ON c.id = a."churchId"`;

function fromAttendeeRow(r: Row | undefined): SubjectResult {
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.status === 'INVALIDATED') return { ok: false, reason: 'invalidated' };
  if (r.status !== 'ACTIVE' || !r.attendeeId || !r.fullName) return { ok: false, reason: 'unclaimed' };
  const church = r.churchName ? clean(r.churchName) : '';
  return { ok: true, subject: { pulseId: r.id, kind: 'attendee', holderName: clean(r.fullName), churchName: church || null } };
}

/** Asistente: su pulsera por el token privado de su sesión. */
export async function subjectForAttendeeToken(token: string): Promise<SubjectResult> {
  if (!QR_TOKEN_RE.test(token)) return { ok: false, reason: 'not_found' };
  const { rows } = await query<Row>(`${SELECT} WHERE p."qrToken" = $1`, [token]);
  return fromAttendeeRow(rows[0]);
}

async function teamLink(where: string, param: string) {
  try {
    const { rows } = await query<{ pulseId: string; name: string; active: boolean; status: string }>(
      `SELECT p.id AS "pulseId", u.name, u.active, p.status::text AS status
         FROM "StaffPulse" sp
         JOIN "Pulse" p ON p.id = sp."pulseId"
         JOIN "User" u ON u.id = sp."userId"
        WHERE ${where} AND sp."unlinkedAt" IS NULL`,
      [param],
    );
    return rows[0];
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '42P01') return undefined; // migración 012 sin aplicar: nadie del equipo tiene pulsera
    throw err;
  }
}

function fromTeamRow(r: Awaited<ReturnType<typeof teamLink>>): SubjectResult {
  if (!r) return { ok: false, reason: 'no_pulse' };
  if (r.status !== 'ACTIVE' || !r.active) return { ok: false, reason: 'invalidated' };
  return { ok: true, subject: { pulseId: r.pulseId, kind: 'team', holderName: clean(r.name), churchName: null } };
}

/** Equipo: la pulsera vinculada a la cuenta de la sesión (el id sale de la cookie verificada). */
export async function subjectForTeamUser(userId: string): Promise<SubjectResult> {
  return fromTeamRow(await teamLink('sp."userId" = $1', userId));
}

/** Para entregar el .pkpass con un boleto vigente: se vuelve a leer todo de la base (estado actual de la pulsera). */
export async function subjectForPulseId(pulseId: string): Promise<SubjectResult> {
  const { rows } = await query<Row>(`${SELECT} WHERE p.id = $1`, [pulseId]);
  const r = rows[0];
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.attendeeId) return fromAttendeeRow(r);
  return fromTeamRow(await teamLink('sp."pulseId" = $1', pulseId));
}

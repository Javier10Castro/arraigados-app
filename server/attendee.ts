import { NOW_UTC, newId, query, withTransaction } from './db';
import { getBenefitLabels } from './benefits';
import { getProfile } from './profile';
import { deriveCity, type Church } from '../shared/churches';
import {
  QR_TOKEN_RE,
  isValidAgeRange,
  type ClaimRequest,
  type ClaimResponse,
  type MeResponse,
  type PackageSummary,
  type PulseStatusResponse,
} from '../shared/api';

/**
 * Lógica del asistente sobre las tablas existentes de Neon.
 * Réplica de src/lib/claim.ts y src/lib/pulses.ts del Next.js: mismas
 * validaciones, misma reclamación atómica, mismos resultados. Si allá
 * cambia una regla, cambiarla aquí también.
 */

export class ValidationError extends Error {}

type PulseRow = {
  id: string;
  status: 'UNCLAIMED' | 'ACTIVE' | 'INVALIDATED';
  attendeeId: string | null;
  drinksUsed: number;
  packageName: string;
  price: number;
  includedDrinks: number;
};

async function findPulse(token: string): Promise<PulseRow | null> {
  if (!QR_TOKEN_RE.test(token)) return null;
  const { rows } = await query<PulseRow>(
    `SELECT p.id, p.status, p."attendeeId", p."drinksUsed",
            k.name AS "packageName", k.price, k."includedDrinks"
       FROM "Pulse" p
       JOIN "Package" k ON k.id = p."packageId"
      WHERE p."qrToken" = $1`,
    [token],
  );
  return rows[0] ?? null;
}

/**
 * ¿La pulsera tiene un vínculo VIGENTE con una cuenta del equipo ("StaffPulse", migración 012)?
 * Solo se consulta para una pulsera ACTIVE sin asistente (caso raro), así que no cuesta nada en el flujo normal.
 * Sin la migración 012 la tabla no existe (42P01): entonces no puede haber vínculos y la respuesta es «no».
 * Cualquier otro error se propaga (no se adivina). Una pulsera ACTIVE sin asistente y SIN vínculo (p. ej. su asistente
 * se borró) NO se marca como reservada; igualmente nunca se puede reclamar (claimPulse solo actúa sobre UNCLAIMED).
 */
async function isLinkedToTeam(p: PulseRow): Promise<boolean> {
  if (p.status !== 'ACTIVE' || p.attendeeId !== null) return false;
  try {
    const { rowCount } = await query(`SELECT 1 FROM "StaffPulse" WHERE "pulseId" = $1 AND "unlinkedAt" IS NULL`, [p.id]);
    return (rowCount ?? 0) > 0;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '42P01') return false;
    throw err;
  }
}

const pkg = (r: PulseRow): PackageSummary => ({ name: r.packageName, price: r.price, includedDrinks: r.includedDrinks });

/** Estado público de una pulsera. No revela datos del asistente. */
export async function getPulseStatus(token: string): Promise<PulseStatusResponse> {
  const pulse = await findPulse(token);
  if (!pulse) return { status: 'not_found' };
  if (pulse.status === 'INVALIDATED') return { status: 'invalidated' };
  // Reservada para una cuenta del equipo = vínculo vigente en "StaffPulse" (solo lo crea un Admin autorizado). No revela datos.
  if (await isLinkedToTeam(pulse)) return { status: 'team' };
  if (pulse.status === 'ACTIVE') return { status: 'active' };
  return { status: 'unclaimed', package: pkg(pulse) };
}

/** Lista para el buscador del registro (listChurchesForSearch del Next.js). */
export async function listChurches(): Promise<Church[]> {
  const { rows } = await query<{ id: string; name: string; presbyteryName: string; zoneName: string }>(
    `SELECT c.id, c.name, p.name AS "presbyteryName", z.name AS "zoneName"
       FROM "Church" c
       JOIN "Presbytery" p ON p.id = c."presbyteryId"
       JOIN "Zone" z ON z.id = p."zoneId"
      ORDER BY c.name ASC`,
  );
  return rows.map((c) => ({ ...c, city: deriveCity(c.name, c.presbyteryName) }));
}

export async function listActivePackages(): Promise<PackageSummary[]> {
  const { rows } = await query<PackageSummary>(
    `SELECT name, price, "includedDrinks" FROM "Package" WHERE active = true ORDER BY price ASC, name ASC`,
  );
  return rows;
}

class ClaimRaceError extends Error {}

/**
 * Reclama una pulsera (claimPulse del Next.js):
 * - El paquete nunca lo elige el usuario: viene de la pulsera.
 * - Atómica: el UPDATE solo afecta la fila si sigue UNCLAIMED; si otro la
 *   ganó entre la lectura y aquí, rowCount = 0 y se deshace TODO (incluido
 *   el Attendee recién creado).
 * - drinksUsed se pone en 0 al reclamar, igual que el Next.js.
 * - Igual que el Next.js, no escribe en AuditLog.
 */
export async function claimPulse(input: ClaimRequest): Promise<ClaimResponse> {
  const pulse = await findPulse(String(input.token ?? ''));
  if (!pulse) return { outcome: 'not_found' };
  if (pulse.status === 'INVALIDATED') return { outcome: 'invalidated' };
  if (pulse.status === 'ACTIVE') return { outcome: (await isLinkedToTeam(pulse)) ? 'team' : 'already_active' };

  const fullName = String(input.fullName ?? '').trim();
  if (fullName.length < 2 || fullName.length > 120) throw new ValidationError('Escribe tu nombre completo.');
  const ageRange = String(input.ageRange ?? '');
  if (!isValidAgeRange(ageRange)) throw new ValidationError('Selecciona tu rango de edad.');
  const churchId = String(input.churchId ?? '');
  const church = await query(`SELECT 1 FROM "Church" WHERE id = $1`, [churchId]);
  if (church.rowCount === 0) throw new ValidationError('Elige tu iglesia de la lista.');

  try {
    await withTransaction(async (tx) => {
      const attendeeId = newId();
      await tx.query(
        `INSERT INTO "Attendee" (id, "fullName", "ageRange", "churchId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, ${NOW_UTC}, ${NOW_UTC})`,
        [attendeeId, fullName, ageRange, churchId],
      );
      const update = await tx.query(
        `UPDATE "Pulse"
            SET status = 'ACTIVE', "attendeeId" = $1, "claimedAt" = ${NOW_UTC},
                "drinksUsed" = 0, "updatedAt" = ${NOW_UTC}
          WHERE id = $2 AND status = 'UNCLAIMED'`,
        [attendeeId, pulse.id],
      );
      if (update.rowCount === 0) throw new ClaimRaceError();
    });
    return { outcome: 'claimed' };
  } catch (err) {
    if (err instanceof ClaimRaceError) {
      const fresh = await findPulse(input.token);
      if (fresh?.status === 'ACTIVE') return { outcome: (await isLinkedToTeam(fresh)) ? 'team' : 'already_active' };
      if (fresh?.status === 'INVALIDATED') return { outcome: 'invalidated' };
      return { outcome: 'not_found' };
    }
    throw err;
  }
}

/**
 * Datos del asistente dueño de la pulsera. El token es su credencial: se
 * resuelve en el servidor en cada llamada y solo cuenta si está ACTIVE.
 * No incluye el código manual (herramienta exclusiva de Staff).
 */
export async function getMe(token: string): Promise<{ ok: true; me: MeResponse } | { ok: false; status: PulseStatusResponse['status'] }> {
  if (!QR_TOKEN_RE.test(token)) return { ok: false, status: 'not_found' };
  const { rows } = await query<{
    status: PulseRow['status'];
    drinksUsed: number;
    packageId: string;
    packageName: string;
    price: number;
    includedDrinks: number;
    attendeeId: string | null;
    fullName: string | null;
    ageRange: string | null;
    churchName: string | null;
    presbyteryName: string | null;
    zoneName: string | null;
  }>(
    `SELECT p.status, p."drinksUsed",
            k.id AS "packageId", k.name AS "packageName", k.price, k."includedDrinks",
            a.id AS "attendeeId", a."fullName", a."ageRange",
            c.name AS "churchName", pr.name AS "presbyteryName", z.name AS "zoneName"
       FROM "Pulse" p
       JOIN "Package" k ON k.id = p."packageId"
       LEFT JOIN "Attendee" a ON a.id = p."attendeeId"
       LEFT JOIN "Church" c ON c.id = a."churchId"
       LEFT JOIN "Presbytery" pr ON pr.id = c."presbyteryId"
       LEFT JOIN "Zone" z ON z.id = pr."zoneId"
      WHERE p."qrToken" = $1`,
    [token],
  );
  const r = rows[0];
  if (!r) return { ok: false, status: 'not_found' };
  if (r.status === 'INVALIDATED') return { ok: false, status: 'invalidated' };
  if (r.status === 'UNCLAIMED' || !r.fullName || !r.attendeeId) return { ok: false, status: 'unclaimed' };
  // El perfil es OPCIONAL: null = aún no personalizó, migraciones 009/010 sin aplicar, o la consulta falló.
  // Un fallo aquí nunca debe tirar /api/me (de eso depende toda la sesión del asistente): se registra y se
  // responde sin `profile`, y la app dibuja el avatar de siempre.
  const profile = await getProfile(r.attendeeId).catch((err: unknown) => {
    console.error('[me] no se pudo leer el perfil (se responde sin él):', err instanceof Error ? err.message : err);
    return null;
  });
  const benefits = await getBenefitLabels(r.packageId); // null = migración 008 sin aplicar -> el cliente usa la lista fija

  return {
    ok: true,
    me: {
      attendee: {
        id: r.attendeeId,
        fullName: r.fullName,
        ageRange: r.ageRange,
        churchName: r.churchName ?? '',
        presbyteryName: r.presbyteryName ?? '',
        zoneName: r.zoneName ?? '',
      },
      package: { name: r.packageName, price: r.price, includedDrinks: r.includedDrinks, ...(benefits ? { benefits } : {}) },
      drinksUsed: r.drinksUsed,
      drinksRemaining: Math.max(r.includedDrinks - r.drinksUsed, 0),
      ...(profile ? { profile } : {}),
    },
  };
}

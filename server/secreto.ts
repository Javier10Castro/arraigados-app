import { query } from './db';

/**
 * "Secreto" (solo cuenta propietaria): lista de asistentes por kit, una línea por persona: "Nombre - Iglesia".
 * Solo LECTURA. Mismo universo que Admin -> Asistentes: asistentes con pulsera ACTIVA (el equipo no entra).
 * El kit se reconoce por nombre (tolera "Kit - A", "Kit A", "Paquete A", "Especial"...).
 */
export const SECRETO_KITS = {
  a: { label: 'Kit A', pattern: '^(kit|paquete)\\s*-?\\s*a$' },
  b: { label: 'Kit B', pattern: '^(kit|paquete)\\s*-?\\s*b$' },
  especial: { label: 'Kit Especial', pattern: '^(kit\\s*-?\\s*especial|especial|paquete\\s*-?\\s*c)$' },
} as const;
export type SecretoKit = keyof typeof SECRETO_KITS;

export const isSecretoKit = (v: unknown): v is SecretoKit => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SECRETO_KITS, v);

export async function listKitLines(kit: SecretoKit): Promise<string[]> {
  const { rows } = await query<{ lista: string }>(
    `SELECT regexp_replace(btrim(a."fullName"), '\\s+', ' ', 'g') || ' - ' || regexp_replace(btrim(c.name), '\\s+', ' ', 'g') AS lista
       FROM "Attendee" a
       JOIN "Pulse" p   ON p."attendeeId" = a.id AND p.status = 'ACTIVE'
       JOIN "Package" k ON k.id = p."packageId"
       JOIN "Church" c  ON c.id = a."churchId"
      WHERE k.name ~* $1
      ORDER BY a."fullName", a.id`,
    [SECRETO_KITS[kit].pattern],
  );
  return rows.map((r) => r.lista);
}

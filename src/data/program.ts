import { VENUE_12VA, VENUE_21RA } from './app';

/**
 * Programa público del congreso para la experiencia /home (NUEVO ARCHIVO --
 * src/data/app.ts ya tenía un `schedule` distinto, usado hoy por /programa y
 * que NO se toca en esta etapa; ver docs/CLAUDE_HANDOFF.md).
 *
 * HALLAZGO DOCUMENTADO (no inventado): no existe ninguna tabla en Neon para
 * el programa del congreso (horarios/eventos). Este contenido es ESTÁTICO,
 * tomado literalmente del brief del propietario (2 oct 2026). Si en el
 * futuro el programa cambia, se edita aquí -- no hay panel de administración
 * para esto todavía.
 *
 * Filtro editorial pedido explícitamente: solo HORA + EVENTO. Nunca mostrar
 * responsable, iglesia responsable, notas internas, duración exacta,
 * información operativa interna, ni nombres de predicadores/participantes.
 */

export type ProgramItem = { time: string; event: string };

/** Sábado: una sola sede para todos, sin importar la zona del asistente. */
export const SATURDAY_VENUE = VENUE_12VA;
export const SATURDAY_PROGRAM: ProgramItem[] = [
  { time: '2:00 pm', event: 'Bienvenida' },
  { time: '2:10 pm', event: 'Plenaria 1 — Raíces profundas' },
  { time: '3:10 pm', event: 'Plenaria 2 — Sobreedificados en Él' },
  { time: '4:10 pm', event: 'Break / Venta por parte del Distrito' },
  { time: '5:30 pm', event: 'Video / Contador' },
  { time: '5:35 pm', event: 'Inicio Culto' },
  { time: '6:00 pm', event: 'Ofrenda' },
  { time: '6:15 pm', event: 'Predicación y Ministración' },
  { time: '7:25 pm', event: 'Despedida' },
  { time: '7:30 pm', event: 'Convivencia' },
];

/**
 * Domingo: el mismo horario en ambas sedes -- lo único que cambia es la
 * sede, según la zona del asistente.
 *   Zona 1 -> 21ra IAFCJ
 *   Zona 2 -> 12va IAFCJ
 */
export const SUNDAY_PROGRAM: ProgramItem[] = [
  { time: '6:00 pm', event: 'Video / Contador' },
  { time: '6:05 pm', event: 'Inicio Culto' },
  { time: '6:30 pm', event: 'Ofrenda' },
  { time: '6:45 pm', event: 'Predicación y Ministración' },
  { time: '7:45 pm', event: 'Despedida' },
];

export type ZoneKey = 'Zona 1' | 'Zona 2';

/**
 * Relación oficial zona -> sede del domingo (2 oct 2026). No cambiar sin
 * confirmar con el propietario: afecta dónde cree el asistente que debe
 * presentarse.
 */
export const SUNDAY_VENUE_BY_ZONE: Record<ZoneKey, string> = {
  'Zona 1': VENUE_21RA,
  'Zona 2': VENUE_12VA,
};

/**
 * "Tu zona" para la pantalla /home: si el dato de Neon no trae exactamente
 * "Zona 1" o "Zona 2" (registro viejo/incompleto), se usa "Zona 1" como
 * respaldo SOLO para decidir qué mostrar aquí -- nunca se escribe de vuelta
 * a la base de datos ni se asume que el asistente "pertenece" a esa zona.
 * Decisión explícita del propietario (2 oct 2026): un dato faltante es un
 * asunto administrativo a corregir por Staff/Admin, no un error que deba
 * resolver el asistente.
 */
export function resolveZoneForDisplay(zoneName: string | null | undefined): ZoneKey {
  return zoneName === 'Zona 2' ? 'Zona 2' : 'Zona 1';
}

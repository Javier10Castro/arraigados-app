import { VENUE_12VA, VENUE_21RA } from './app';

/**
 * PROGRAMA OFICIAL del congreso (confirmado por el propietario el 6 oct 2026,
 * hoja "PROGRAMA — CONGRESO ARRAIGADOS RJDT"). Es la ÚNICA fuente: la leen
 * /home, /programa y el reverso del gafete (/homev2).
 *
 * Cambios del 6 oct 2026 respecto a la versión anterior (brief del 2 oct):
 *  - Sábado 5:30 pm: "Video / Contador" -> "Video Bienvenida y Contador".
 *  - Sábado: se quitó "Convivencia 7:30 pm" (no está en el programa oficial;
 *    el sábado termina con "Despedida 7:25 pm").
 *
 * NOMBRES DE DESPLIEGUE (6 oct 2026, pedido del propietario): en la app se
 * muestran más cortos que en la hoja oficial. Se guarda aquí el nombre
 * oficial por si hace falta volver a él (basta cambiar el `event` de abajo y,
 * en Home.tsx, la clave de KIND_TITLE_OVERRIDES):
 *   Sábado 4:10 pm  app: "Break"  | oficial: "Break / Venta por parte del Distrito"
 *   Sábado 5:30 pm  app: "Intro"  | oficial: "Video Bienvenida y Contador"
 *   Domingo 6:00 pm app: "Intro"  | oficial: "Video / Contador"
 *
 * El Excel oficial trae además Tiempo, Responsable, Iglesia y Notas, que NO se
 * publican (ver filtro editorial abajo).
 *
 * Programa público para la experiencia /home (NUEVO ARCHIVO --
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

import { SATURDAY_PROGRAM, SUNDAY_PROGRAM, type ProgramItem } from '../../shared/programSchedule';
export type { ProgramItem };
// Las horas viven en shared/programSchedule.ts (las usa también el servidor para los
// recordatorios de la campana). Para cambiar el programa, edita ESE archivo.
export { SATURDAY_PROGRAM, SUNDAY_PROGRAM };

/** Sábado: una sola sede para todos, sin importar la zona del asistente. */
export const SATURDAY_VENUE = VENUE_12VA;

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

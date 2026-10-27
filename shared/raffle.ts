import { SATURDAY_PROGRAM } from './programSchedule';

/**
 * Rifa del congreso (migración 017): premios por kit y las 3 preguntas para inscribirse.
 * ÚNICA fuente de verdad, compartida por el servidor (qué kits tienen rifa, validación de respuestas) y la app
 * (pantallas /rifa, /premios, Admin → Rifas y el proyector). Las imágenes viven en src/data/rafflePrizes.ts para que
 * el servidor no arrastre archivos de imagen.
 *
 * Premios según «Premios.pdf» (27 oct 2026). Para cambiar un premio se cambia SOLO aquí (y su imagen en src/assets/premios).
 */
export type RafflePrizeKey = 'especial' | 'kitb' | 'kita';

export type RafflePrize = {
  key: RafflePrizeKey;
  /** Nombre del kit tal como está en "Package".name. */
  kitName: string;
  /** Rótulo corto de la rifa («Rifa Especial»). */
  label: string;
  /** El premio. */
  title: string;
  /** Una línea de apoyo (opcional). */
  detail: string;
};

/** Orden de presentación: del premio mayor al menor (como en el PDF). */
export const RAFFLE_PRIZES: readonly RafflePrize[] = [
  { key: 'especial', kitName: 'Especial', label: 'Rifa Especial', title: 'Amazon Echo Pop', detail: 'Bocina inteligente con Alexa' },
  { key: 'kitb', kitName: 'Kit - B', label: 'Rifa Kit B', title: 'Owala FreeSip', detail: 'Termo de acero inoxidable' },
  { key: 'kita', kitName: 'Kit - A', label: 'Rifa Kit A', title: 'Tarjeta de regalo Amazon', detail: '$300' },
];

/** «Kit - A», «kit-a», «KIT A» -> «kita». Así un cambio menor de escritura del kit no deja a nadie fuera. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Premio del kit, o null si ese kit no tiene rifa (p. ej. «Inscripción Domingo»). */
export function prizeForKit(kitName: string | null | undefined): RafflePrize | null {
  if (!kitName) return null;
  const k = norm(kitName);
  return RAFFLE_PRIZES.find((p) => norm(p.kitName) === k) ?? null;
}

/* ------------------------------------------------------------------ */
/* Preguntas para entrar a la rifa                                     */
/* ------------------------------------------------------------------ */

export const RAFFLE_QUESTIONS = {
  liked: '¿Qué fue lo que más te gustó?',
  plenary: '¿Cuál fue tu plenaria favorita?',
  lesson: '¿Qué enseñanza te dejó el congreso?',
} as const;

/** Opciones de «plenaria favorita»: salen del programa oficial (las del sábado que empiezan con «Plenaria»). */
export const RAFFLE_PLENARIES: readonly string[] = SATURDAY_PROGRAM.filter((i) => /^Plenaria/i.test(i.event)).map((i) => i.event);

export const RAFFLE_ANSWER_MIN = 3;
export const RAFFLE_ANSWER_MAX = 400;

export type RaffleAnswers = { liked: string; plenary: string; lesson: string };

/** Limpia espacios repetidos y saltos de línea de más (las respuestas se leen en una tabla). */
export const cleanAnswer = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Valida y limpia las respuestas. Devuelve el mensaje de error para el asistente, o las respuestas limpias. */
export function checkRaffleAnswers(input: Partial<Record<keyof RaffleAnswers, unknown>> | null | undefined): { ok: true; answers: RaffleAnswers } | { ok: false; error: string } {
  const liked = cleanAnswer(input?.liked);
  const plenary = cleanAnswer(input?.plenary);
  const lesson = cleanAnswer(input?.lesson);
  const len = (s: string) => [...s].length;
  if (len(liked) < RAFFLE_ANSWER_MIN) return { ok: false, error: 'Cuéntanos qué fue lo que más te gustó.' };
  if (len(liked) > RAFFLE_ANSWER_MAX) return { ok: false, error: `Tu respuesta sobre lo que más te gustó es muy larga (máximo ${RAFFLE_ANSWER_MAX} caracteres).` };
  if (!RAFFLE_PLENARIES.includes(plenary)) return { ok: false, error: 'Elige tu plenaria favorita.' };
  if (len(lesson) < RAFFLE_ANSWER_MIN) return { ok: false, error: 'Cuéntanos qué enseñanza te dejó el congreso.' };
  if (len(lesson) > RAFFLE_ANSWER_MAX) return { ok: false, error: `Tu respuesta sobre la enseñanza es muy larga (máximo ${RAFFLE_ANSWER_MAX} caracteres).` };
  return { ok: true, answers: { liked, plenary, lesson } };
}

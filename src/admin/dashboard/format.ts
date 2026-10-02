import { EVENT_TIMEZONE } from '../../../shared/api';

/** Formatos del Dashboard. Horas y fechas SIEMPRE en hora de Tijuana (la del congreso). */

const intFmt = new Intl.NumberFormat('es-MX');
export const fmtInt = (n: number) => intFmt.format(n);

/** "42%" (sin decimales salvo que sea < 10 y no entero: "4.5%"). */
export function fmtPct(part: number, total: number): string {
  if (!total) return '0%';
  const v = (part / total) * 100;
  const digits = v > 0 && v < 10 && !Number.isInteger(v) ? 1 : 0;
  return `${v.toFixed(digits)}%`;
}

/** Centavos de MXN → "$86,050". */
export const fmtMoney = (cents: number) =>
  (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

/** 15 → "15:00". */
export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** "2026-10-17" → "sáb 17 oct" (la fecha ya es local; se formatea en UTC para no correrla). */
export function dayLabel(day: string, long = false): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d
    .toLocaleDateString('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: long ? 'long' : 'short' })
    .replace(/\./g, '')
    .replace(',', '');
}

/** ISO UTC → "12:43" en Tijuana. */
export const timeLabel = (iso: string, seconds = false) =>
  new Date(iso).toLocaleTimeString('es-MX', {
    timeZone: EVENT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
  });

/** ISO UTC → "YYYY-MM-DD" del día en Tijuana. */
export const localDayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: EVENT_TIMEZONE });

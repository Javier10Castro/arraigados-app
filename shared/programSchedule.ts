import type { AppNotification } from './notifications';

/**
 * PROGRAMA del congreso (horas y eventos) -- ÚNICA fuente de verdad, compartida por
 * la app (src/data/program.ts la re-exporta para /home, /programa y el gafete) y por
 * el servidor (recordatorios de la campana, fase 3 de notificaciones, 7 oct 2026).
 *
 * Vive en shared/ para que el servidor pueda leerla sin importar src/ (que arrastra
 * imágenes). Las sedes se repiten aquí como texto; deben coincidir con
 * VENUE_12VA / VENUE_21RA de src/data/app.ts.
 */
export type ProgramItem = { time: string; event: string };

export const PROGRAM_VENUE_12VA = '12va IAFCJ';
export const PROGRAM_VENUE_21RA = '21ra IAFCJ';

/** Sábado: una sola sede para todos, sin importar la zona. */
export const SATURDAY_PROGRAM: ProgramItem[] = [
  { time: '2:00 pm', event: 'Bienvenida' },
  { time: '2:10 pm', event: 'Plenaria 1 — Raíces profundas' },
  { time: '3:10 pm', event: 'Plenaria 2 — Sobreedificados en Él' },
  { time: '4:10 pm', event: 'Break' },
  { time: '5:30 pm', event: 'Intro' },
  { time: '5:35 pm', event: 'Inicio Culto' },
  { time: '6:00 pm', event: 'Ofrenda' },
  { time: '6:15 pm', event: 'Predicación y Ministración' },
  { time: '7:25 pm', event: 'Despedida' },
];

/** Domingo: mismo horario en ambas sedes; cambia la sede según la zona. */
export const SUNDAY_PROGRAM: ProgramItem[] = [
  { time: '6:00 pm', event: 'Intro' },
  { time: '6:05 pm', event: 'Inicio Culto' },
  { time: '6:30 pm', event: 'Ofrenda' },
  { time: '6:45 pm', event: 'Predicación y Ministración' },
  { time: '7:45 pm', event: 'Despedida' },
];

/* ------------------------------------------------------------------ */
/* Recordatorios automáticos (campana de /home)                        */
/* ------------------------------------------------------------------ */

/** Fechas del congreso (hora de Tijuana). Si cambian las fechas, cambiar aquí. */
export const CONGRESS_SATURDAY = '2026-10-17';
export const CONGRESS_SUNDAY = '2026-10-18';
/** Tijuana en octubre sigue en horario de verano (PDT, UTC-7); el cambio es el 1 de noviembre. */
const TIJUANA_OFFSET = '-07:00';
/** Minutos de anticipación con los que aparece el recordatorio. */
export const REMINDER_LEAD_MIN = 10;
/** El recordatorio deja de mostrarse 3 horas después de que empieza el momento (no se acumulan los del día anterior). */
const REMINDER_KEEP_MIN = 180;
/** Solo se avisa de los momentos importantes (no de Intro, Ofrenda, Break ni Despedida). */
const REMIND_EVENTS = /^(Bienvenida|Plenaria|Inicio Culto|Predicación)/;

/** "2:10 pm" + "2026-10-17" -> instante UTC. */
export function programInstant(date: string, time: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(time.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3]!.toLowerCase() === 'pm') h += 12;
  const d = new Date(`${date}T${String(h).padStart(2, '0')}:${m[2]}:00${TIJUANA_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type ReminderNotification = Extract<AppNotification, { kind: 'reminder' }>;

/**
 * Recordatorios YA vigentes (su hora de aviso ya pasó) para una zona. Se calculan en cada
 * lectura a partir del programa; no se guardan en la base de datos. `seenAt` (la última vez
 * que el asistente abrió la campana) decide si cuentan como nuevos.
 */
export function programReminders(now: Date, zone: 'Zona 1' | 'Zona 2', seenAt: Date | null): ReminderNotification[] {
  const days: { date: string; items: ProgramItem[]; venue: string }[] = [
    { date: CONGRESS_SATURDAY, items: SATURDAY_PROGRAM, venue: PROGRAM_VENUE_12VA },
    { date: CONGRESS_SUNDAY, items: SUNDAY_PROGRAM, venue: zone === 'Zona 2' ? PROGRAM_VENUE_12VA : PROGRAM_VENUE_21RA },
  ];
  const out: ReminderNotification[] = [];
  for (const day of days) {
    for (const item of day.items) {
      if (!REMIND_EVENTS.test(item.event)) continue;
      const start = programInstant(day.date, item.time);
      if (!start) continue;
      const at = new Date(start.getTime() - REMINDER_LEAD_MIN * 60_000);
      if (at.getTime() > now.getTime()) continue;
      if (now.getTime() - start.getTime() > REMINDER_KEEP_MIN * 60_000) continue;
      out.push({
        id: `${day.date}-${item.time.replace(/\s|:/g, '')}`,
        kind: 'reminder',
        title: item.event,
        body: `Empieza en ${REMINDER_LEAD_MIN} minutos (${item.time}) · ${day.venue}`,
        at: at.toISOString(),
        unread: !seenAt || at.getTime() > seenAt.getTime(),
      });
    }
  }
  return out;
}

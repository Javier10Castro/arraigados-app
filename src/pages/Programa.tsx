import { useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import LocationButton from '../components/LocationButton';
import { usePulseSession } from '../context/PulseSession';
import {
  SATURDAY_PROGRAM,
  SATURDAY_VENUE,
  SUNDAY_PROGRAM,
  SUNDAY_VENUE_BY_ZONE,
  resolveZoneForDisplay,
  type ProgramItem,
} from '../data/program';
import { EVENT_TIMEZONE } from '../../shared/api';
import styles from './Programa.module.css';

/**
 * /programa -- el programa OFICIAL del congreso (5 oct 2026).
 *
 * Antes mostraba un programa de relleno (data/app.ts `schedule`: "Culto de
 * Apertura 16:30", etc.) que NO coincidía con el real. Ahora usa la MISMA fuente
 * que la pantalla /home: src/data/program.ts (hora + evento, tomado del brief del
 * propietario). Sábado: una sola sede para todos. Domingo: mismo horario en las
 * dos sedes, y la sede depende de la zona del asistente (SUNDAY_VENUE_BY_ZONE).
 * Para cambiar el programa se edita program.ts y se actualizan las dos pantallas.
 */

type Day = {
  id: 'sab17' | 'dom18';
  label: string;
  long: string;
  date: string;
  items: readonly ProgramItem[];
};

const DAYS: Day[] = [
  { id: 'sab17', label: 'SÁB 17', long: 'Sábado 17 de octubre', date: '2026-10-17', items: SATURDAY_PROGRAM },
  { id: 'dom18', label: 'DOM 18', long: 'Domingo 18 de octubre', date: '2026-10-18', items: SUNDAY_PROGRAM },
];

/** Día que se abre primero: el domingo solo cuando ya es domingo en la zona horaria del evento. */
function initialDay(): Day['id'] {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIMEZONE }).format(new Date());
  return today >= '2026-10-18' ? 'dom18' : 'sab17';
}

export default function Programa() {
  const { me } = usePulseSession();
  const zone = resolveZoneForDisplay(me?.attendee.zoneName);
  const [dayId, setDayId] = useState<Day['id']>(initialDay);
  const day = DAYS.find((d) => d.id === dayId)!;

  const venue = useMemo(() => (day.id === 'sab17' ? SATURDAY_VENUE : SUNDAY_VENUE_BY_ZONE[zone]), [day.id, zone]);
  const venueNote = day.id === 'sab17' ? 'Sede para todos los asistentes' : `Sede según tu zona (${zone})`;

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Programa" />

      <div className={styles.days} role="tablist" aria-label="Días del congreso">
        {DAYS.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === dayId}
            type="button"
            className={`${styles.day} ${d.id === dayId ? styles.dayActive : ''}`}
            onClick={() => setDayId(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <p className={styles.dayLong}>{day.long}</p>

      <div className={styles.venueBox}>
        <MapPin size={18} strokeWidth={2.1} aria-hidden="true" />
        <div className={styles.venueText}>
          <strong>{venue}</strong>
          <span>{venueNote}</span>
        </div>
        <LocationButton venue={venue} />
      </div>

      <ol className={styles.timeline}>
        {day.items.map((it) => (
          <li key={`${it.time}-${it.event}`} className={styles.item}>
            <span className={styles.time}>{it.time}</span>
            <div className={styles.card}>
              <h3 className={styles.title}>{it.event}</h3>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
